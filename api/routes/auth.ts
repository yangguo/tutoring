/**
 * Authentication API routes for the Interactive English Tutor
 * Handle user registration, login, logout, and profile management
 */
import { Router, type Request, type Response } from 'express';
import Joi from 'joi';
import { supabase, User } from '../config/supabase';
import { generateToken, authenticateToken, requireRole } from '../utils/jwt';

const router = Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  full_name: Joi.string().required(),
  role: Joi.string().valid('child', 'parent', 'admin').required(),
  age: Joi.number().min(3).max(18).when('role', {
    is: 'child',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  grade_level: Joi.string().when('role', {
    is: 'child',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  parent_email: Joi.string().email().when('role', {
    is: 'child',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  full_name: Joi.string().optional(),
  age: Joi.number().min(3).max(18).optional(),
  grade_level: Joi.string().optional()
});

/**
 * User Registration
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError, value } = registerSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { email, password, full_name, role, age, grade_level, parent_email } = value;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      res.status(409).json({ error: 'User already exists with this email' });
      return;
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user) {
      res.status(400).json({ error: authError?.message || 'Failed to create user' });
      return;
    }

    // Find parent if parent_email is provided
    let parent_id = null;
    if (parent_email && role === 'child') {
      const { data: parentData } = await supabase
        .from('users')
        .select('id')
        .eq('email', parent_email)
        .eq('role', 'parent')
        .single();
      
      if (parentData) {
        parent_id = parentData.id;
      }
    }

    // Create user profile in our users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role,
        age: role === 'child' ? age : null,
        grade_level: role === 'child' ? grade_level : null,
        parent_id
      })
      .select()
      .single();

    if (userError) {
      // Clean up auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      res.status(500).json({ error: 'Failed to create user profile' });
      return;
    }

    // Generate JWT token
    const token = generateToken(userData as User);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        age: userData.age,
        grade_level: userData.grade_level
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * User Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError, value } = loginSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { email, password } = value;

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Get user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    // Generate JWT token
    const token = generateToken(userData as User);

    res.json({
      message: 'Login successful',
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        age: userData.age,
        grade_level: userData.grade_level,
        parent_id: userData.parent_id
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    // In a JWT-based system, logout is typically handled client-side
    // by removing the token. We could implement a token blacklist here if needed.
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get Current User Profile
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;

    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        age: userData.age,
        grade_level: userData.grade_level,
        parent_id: userData.parent_id,
        created_at: userData.created_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Update User Profile
 * PUT /api/auth/profile
 */
router.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError, value } = updateProfileSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { userId } = (req as any).user;
    const updateData = { ...value, updated_at: new Date().toISOString() };

    const { data: userData, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        age: userData.age,
        grade_level: userData.grade_level,
        parent_id: userData.parent_id
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get Children (for parents)
 * GET /api/auth/children
 */
router.get('/children', authenticateToken, requireRole(['parent']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;

    const { data: children, error } = await supabase
      .from('users')
      .select('id, email, full_name, age, grade_level, created_at')
      .eq('parent_id', userId)
      .eq('role', 'child');

    if (error) {
      res.status(500).json({ error: 'Failed to fetch children' });
      return;
    }

    res.json({ children: children || [] });
  } catch (error) {
    console.error('Get children error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;