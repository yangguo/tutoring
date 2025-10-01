/**
 * Merged API Routes
 * All routes are consolidated into this file.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { supabase, User } from './config/supabase.js';
import { generateToken, authenticateToken, requireRole } from './utils/jwt.js';
import type { Book } from './config/supabase.js';
import lessonChatHandler from './chat/lesson.js';
import speakingPracticeChatHandler from './chat/speaking-practice.js';

const router = Router();

const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB safety limit for inline images
const DEFAULT_OPENAI_VISION_TIMEOUT_MS = 180_000; // 3 minutes for potentially slower APIs

async function getInlineImageUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      console.warn('Failed to fetch image for OpenAI request', imageUrl, response.status, response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    if (!arrayBuffer.byteLength) {
      console.warn('Fetched image is empty, skipping inline conversion', imageUrl);
      return null;
    }

    if (arrayBuffer.byteLength > INLINE_IMAGE_MAX_BYTES) {
      console.warn('Fetched image exceeds inline size limit, falling back to public URL', imageUrl);
      return null;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn('Unable to inline image for OpenAI request', imageUrl, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function hasValidOpenAIConfig(): boolean {
  return Boolean(
    process.env.OPENAI_BASE_URL &&
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'your-openai-api-key-here' &&
    (process.env.OPENAI_API_KEY?.length ?? 0) >= 10
  );
}

function clamp01(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (num < 0) return 0;
  if (num > 1) return 1;
  return Number(num.toFixed(4));
}

type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'challenging';

function normalizeDifficulty(value: unknown): DifficultyLevel {
  if (typeof value !== 'string') return 'challenging';
  const normalized = value.toLowerCase();
  if (['beginner', 'intermediate', 'advanced', 'challenging'].includes(normalized)) {
    return normalized as DifficultyLevel;
  }
  if (['easy'].includes(normalized)) return 'beginner';
  if (['medium', 'moderate'].includes(normalized)) return 'intermediate';
  if (['hard', 'difficult'].includes(normalized)) return 'advanced';
  return 'challenging';
}

interface FallbackGlossaryEntry {
  word: string;
  definition: string;
  translation: string;
  difficulty: DifficultyLevel;
  confidence: number;
  position: { top: number; left: number; width: number; height: number };
  metadata?: Record<string, unknown>;
}

function createFallbackPosition(index: number, total: number) {
  if (total <= 0) {
    return { top: 0.1, left: 0.1, width: 0.2, height: 0.1 };
  }

  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;

  const width = 0.18;
  const height = 0.1;

  const horizontalGap = columns > 1 ? (1 - width) / (columns - 1 || 1) : 0;
  const verticalGap = rows > 1 ? (1 - height) / (rows - 1 || 1) : 0;

  const left = clamp01(column * horizontalGap);
  const top = clamp01(row * verticalGap + 0.05);

  return { top, left, width, height };
}

function generateFallbackGlossaryFromText(text: string | null | undefined, maxEntries = 6): FallbackGlossaryEntry[] {
  if (!text) return [];

  const sanitized = text.toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const words = sanitized.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const stopWords = new Set([
    'the', 'and', 'with', 'from', 'they', 'have', 'this', 'that', 'were', 'said',
    'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there', 'could',
    'other', 'more', 'very', 'what', 'know', 'just', 'into', 'over', 'also', 'your',
    'work', 'life', 'only', 'still', 'should', 'after', 'being', 'before', 'through',
    'when', 'where', 'some', 'then', 'them', 'well', 'once'
  ]);

  const candidates: string[] = [];
  for (const word of words) {
    if (word.length < 5) continue;
    if (stopWords.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    candidates.push(word);
    if (candidates.length >= maxEntries) break;
  }

  return candidates.map((word, index) => ({
    word,
    definition: `Definition for "${word}" is not available in offline mode.`,
    translation: `${word}（待翻译）`,
    difficulty: word.length > 8 ? 'advanced' : 'challenging',
    confidence: 0.35,
    position: createFallbackPosition(index, candidates.length),
    metadata: { source: 'fallback-text', note: 'Generated without AI vision OCR' }
  }));
}



function attemptRepairJsonResponse(rawContent: string): string | null {
  if (!rawContent) return null;

  let candidate = rawContent.replace(/```json|```/g, '').trim();
  if (!candidate) return null;

  console.log('Attempting to repair JSON response, original length:', rawContent.length);
  console.log('Candidate after cleanup, length:', candidate.length);

  // If there's trailing partially-written text after the last closing brace, trim it off.
  const lastClosingBrace = candidate.lastIndexOf('}');
  if (lastClosingBrace !== -1 && lastClosingBrace < candidate.length - 1) {
    const trimmed = candidate.slice(0, lastClosingBrace + 1);
    console.log('Trimmed trailing text after last closing brace, new length:', trimmed.length);
    candidate = trimmed;
  }

  candidate = candidate.replace(/\s+$/, '');

  const countChar = (text: string, char: string) => (text.match(new RegExp(char, 'g')) ?? []).length;

  let openSquares = countChar(candidate, '\\[');
  let closeSquares = countChar(candidate, '\\]');
  let openCurlies = countChar(candidate, '{');
  let closeCurlies = countChar(candidate, '}');

  console.log('Bracket counts - Open squares:', openSquares, 'Close squares:', closeSquares, 'Open curlies:', openCurlies, 'Close curlies:', closeCurlies);

  while (closeSquares < openSquares) {
    candidate += ']';
    closeSquares += 1;
  }

  while (closeCurlies < openCurlies) {
    candidate += '}';
    closeCurlies += 1;
  }

  if (openSquares !== closeSquares || openCurlies !== closeCurlies) {
    console.log('Added missing brackets - Final length:', candidate.length);
  }

  try {
    JSON.parse(candidate);
    console.log('Successfully repaired JSON response');
    return candidate;
  } catch (repairError) {
    console.error('Failed to repair AI JSON response:', repairError);
    console.log('Failed candidate preview:', candidate.slice(-200)); // Show last 200 chars
    return null;
  }
}



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Achievements Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const awardAchievementSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  achievementId: Joi.string().uuid().required()
});

router.get('/achievements', async (_req, res) => {
  try {
    const { data: achievements, error } = await supabase
      .from('achievements')
      .select('*')
      .order('category', { ascending: true })
      .order('points', { ascending: true });

    if (error) {
      console.error('Error fetching achievements:', error);
      return res.status(500).json({ error: 'Failed to fetch achievements' });
    }

    res.json({ achievements });
  } catch (error) {
    console.error('Error in GET /achievements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/achievements/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user!;

    // Check access permissions
    if (currentUser.role === 'child' && currentUser.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (currentUser.role === 'parent') {
      // Check if this is their child
      const { data: child, error: childError } = await supabase
        .from('users')
        .select('parent_id')
        .eq('id', userId)
        .single();

      if (childError || !child || child.parent_id !== currentUser.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get all achievements with user's progress
    const { data: achievements, error: achievementsError } = await supabase
      .from('achievements')
      .select (
        `*,
        user_achievements!left(
          id,
          earned_at,
          user_id
        )`
      )
      .eq('user_achievements.user_id', userId)
      .order('category', { ascending: true })
      .order('points', { ascending: true });

    if (achievementsError) {
      console.error('Error fetching user achievements:', achievementsError);
      return res.status(500).json({ error: 'Failed to fetch achievements' });
    }

    // Format the response
    const formattedAchievements = achievements.map(achievement => ({
      ...achievement,
      earned: achievement.user_achievements.length > 0,
      earned_at: achievement.user_achievements[0]?.earned_at || null
    }));

    // Calculate statistics
    const totalAchievements = achievements.length;
    const earnedAchievements = formattedAchievements.filter(a => a.earned).length;
    const totalPoints = formattedAchievements
      .filter(a => a.earned)
      .reduce((sum, a) => sum + a.points, 0);

    res.json({
      achievements: formattedAchievements,
      stats: {
        total: totalAchievements,
        earned: earnedAchievements,
        totalPoints,
        progress: totalAchievements > 0 ? (earnedAchievements / totalAchievements) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error in GET /achievements/user/:userId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/achievements/award', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error: validationError, value } = awardAchievementSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError.details[0].message });
    }

    const { userId, achievementId } = value;

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if achievement exists
    const { data: achievement, error: achievementError } = await supabase
      .from('achievements')
      .select('*')
      .eq('id', achievementId)
      .single();

    if (achievementError || !achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    // Check if user already has this achievement
    const { data: existingAward, error: existingError } = await supabase
      .from('user_achievements')
      .select('id')
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is expected, other errors are actual problems
      console.error('Error checking existing achievement:', existingError);
      return res.status(500).json({ error: 'Failed to check existing achievements' });
    }

    if (existingAward) {
      return res.status(400).json({ error: 'User already has this achievement' });
    }

    // Award the achievement
    const { data: userAchievement, error: awardError } = await supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_id: achievementId,
        earned_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (awardError) {
      console.error('Error awarding achievement:', awardError);
      return res.status(500).json({ error: 'Failed to award achievement' });
    }

    res.status(201).json({
      message: `Achievement \"${achievement.title}\" awarded to ${user.username}`,
      userAchievement,
      achievement
    });
  } catch (error) {
    console.error('Error in POST /achievements/award:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/achievements/revoke', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { error: validationError, value } = awardAchievementSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError.details[0].message });
    }

    const { userId, achievementId } = value;

    // Find and delete the user achievement
    const { data: deletedAchievement, error: deleteError } = await supabase
      .from('user_achievements')
      .delete()
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .select('*')
      .single();

    if (deleteError || !deletedAchievement) {
      return res.status(404).json({ error: 'Achievement not found for this user' });
    }

    res.json({ message: 'Achievement revoked successfully' });
  } catch (error) {
    console.error('Error in DELETE /achievements/revoke:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/achievements/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Get users with their total achievement points
    const { data: leaderboard, error } = await supabase
      .from('users')
      .select (
        `id,
        username,
        avatar_url,
        user_achievements!inner(
          achievements!inner(
            points
          )
        )`
      )
      .eq('role', 'child')
      .limit(limit);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Calculate total points for each user
    const leaderboardWithPoints = leaderboard.map(user => {
      const totalPoints = user.user_achievements.reduce((sum: number, ua: any) => {
        return sum + ua.achievements.points;
      }, 0);

      return {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        totalPoints,
        achievementCount: user.user_achievements.length
      };
    });

    // Sort by total points (descending)
    leaderboardWithPoints.sort((a, b) => b.totalPoints - a.totalPoints);

    // Add rank
    const rankedLeaderboard = leaderboardWithPoints.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    res.json({ leaderboard: rankedLeaderboard });
  } catch (error) {
    console.error('Error in GET /achievements/leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Auth Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

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

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
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
    let parent_id: string | null = null;
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

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  let requestEmail: string | undefined;
  try {
    console.log('[auth/login] request received', {
      bodyKeys: Object.keys(req.body ?? {}),
    });

    const { error: validationError, value } = loginSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { email, password } = value;
    requestEmail = email;

    console.log('[auth/login] credentials validated', { email });

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('[auth/login] Supabase auth error', {
        email,
        message: authError.message,
        status: authError.status,
      });
    } else {
      console.log('[auth/login] Supabase auth success', {
        email,
        userId: authData.user?.id,
      });
    }

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

    if (userError) {
      console.error('[auth/login] Supabase profile error', {
        email,
        message: userError.message,
        code: userError.code,
      });
    }

    if (userError || !userData) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    console.log('[auth/login] user profile loaded', {
      email,
      role: userData.role,
    });

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
    console.error('[auth/login] unexpected error', {
      email: requestEmail,
      error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/logout', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    // In a JWT-based system, logout is typically handled client-side
    // by removing the token. We could implement a token blacklist here if needed.
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/auth/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
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

router.put('/auth/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
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

router.get('/auth/children', authenticateToken, requireRole(['parent']), async (req: Request, res: Response): Promise<void> => {
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


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Books Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const readingSessionSchema = Joi.object({
  book_id: Joi.string().uuid().required(),
  pages_read: Joi.array().items(Joi.number().positive()).required(),
  time_spent: Joi.number().positive().required(),
  comprehension_score: Joi.number().min(0).max(100).optional(),
  vocabulary_learned: Joi.array().items(Joi.string().uuid()).optional()
});



router.get('/books', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 12,
      difficulty,
      category,
      target_age,
      search
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const offset = (pageNum - 1) * limitNum;

    // Get user ID from token if available
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.userId;
      } catch (error) {
        // Token invalid or expired, continue without user context
      }
    }

    // Build query - show public books OR user's own books
    let query = supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter for public books OR user's own books
    if (userId) {
      query = query.or(`is_public.eq.true,uploaded_by.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    // Apply filters
    if (difficulty) {
      query = query.eq('difficulty_level', difficulty);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (target_age) {
      const age = parseInt(target_age as string);
      query = query
        .lte('target_age_min', age)
        .gte('target_age_max', age);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: books, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: 'Failed to fetch books' });
      return;
    }

    res.json({
      books: books || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/discussions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('book_discussions')
      .select (
        `*,
        books (
          id,
          title
        )`
      )
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: discussions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch discussions' });
      return;
    }

    res.json({
      discussions: discussions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/:bookId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;

    // Try to identify user (optional)
    let userId: string | null = null;
    let role: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.userId;
        role = decoded.role;
      } catch (e) {
        // ignore invalid tokens and continue as unauthenticated
      }
    }

    // Get book regardless of visibility first
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    // Access control: allow if public, admin, owner, or assigned via a lesson
    let allowed = !!book.is_public;
    if (!allowed && role === 'admin') allowed = true;
    if (!allowed && userId && book.uploaded_by === userId) allowed = true;
    if (!allowed && userId) {
      const { data: lessons } = await supabase
        .from('lesson_plans')
        .select('id')
        .contains('assigned_students', [userId])
        .contains('book_ids', [bookId])
        .limit(1);
      if (lessons && lessons.length > 0) allowed = true;
    }

    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get book pages
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('*')
      .eq('book_id', bookId)
      .order('page_number', { ascending: true });

    if (pagesError) {
      res.status(500).json({ error: 'Failed to fetch book pages' });
      return;
    }

    res.json({
      book: {
        ...book,
        pages: pages || []
      }
    });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/books/reading-session', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError, value } = readingSessionSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { userId } = (req as any).user;
    const { book_id, pages_read, time_spent, comprehension_score, vocabulary_learned } = value;

    // Verify book exists
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id')
      .eq('id', book_id)
      .eq('is_public', true)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    // Create reading session
    const { data: sessionData, error: sessionError } = await supabase
      .from('reading_sessions')
      .insert({
        user_id: userId,
        book_id,
        pages_read,
        time_spent,
        comprehension_score,
        vocabulary_learned
      })
      .select()
      .single();

    if (sessionError) {
      res.status(500).json({ error: 'Failed to create speaking session' });
      return;
    }

    res.status(201).json({
      message: 'Speaking session created successfully',
      session: {
        id: sessionData.id,
        book_id: sessionData.book_id,
        page_number: sessionData.page_number,
        pronunciation_score: sessionData.pronunciation_score,
        fluency_score: sessionData.fluency_score,
        accuracy_score: sessionData.accuracy_score,
        created_at: sessionData.created_at
      }
    });
  } catch (error) {
    console.error('Create speaking session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/progress', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id } = req.query;

    let query = supabase
      .from('user_progress')
      .select (
        `*,
        books (
          id,
          title,
          difficulty_level,
          target_age_min,
          target_age_max
        )`
      )
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: progress, error } = await query.order('last_read_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch progress' });
      return;
    }

    res.json({ progress: progress || [] });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/reading-sessions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('reading_sessions')
      .select (
        `*,
        books (
          id,
          title
        )`
      )
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: sessions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch reading sessions' });
      return;
    }

    res.json({
      sessions: sessions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get reading sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/speaking-sessions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('speaking_sessions')
      .select (
        `*,
        books (
          id,
          title
        )`
      )
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: sessions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch speaking sessions' });
      return;
    }

    res.json({
      sessions: sessions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get speaking sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/vocabulary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { difficulty_level, search, page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('vocabulary_words')
      .select('*');

    if (difficulty_level) {
      query = query.eq('difficulty_level', difficulty_level);
    }

    if (search) {
      query = query.or(`word.ilike.%${search}%,definition.ilike.%${search}%`);
    }

    const { data: vocabulary, error } = await query
      .order('word', { ascending: true })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch vocabulary' });
      return;
    }

    res.json({
      vocabulary: vocabulary || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/books/vocabulary/learn', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { word_id } = req.body;

    if (!word_id) {
      res.status(400).json({ error: 'Word ID is required' });
      return;
    }

    // Check if word exists
    const { data: word, error: wordError } = await supabase
      .from('vocabulary_words')
      .select('id')
      .eq('id', word_id)
      .single();

    if (wordError || !word) {
      res.status(404).json({ error: 'Vocabulary word not found' });
      return;
    }

    // Check if already learned
    const { data: existing } = await supabase
      .from('user_vocabulary')
      .select('id')
      .eq('user_id', userId)
      .eq('word_id', word_id)
      .single();

    if (existing) {
      res.status(409).json({ error: 'Word already in user vocabulary' });
      return;
    }

    // Add to user vocabulary
    const { data: userVocab, error: vocabError } = await supabase
      .from('user_vocabulary')
      .insert({
        user_id: userId,
        word_id,
        mastery_level: 1
      })
      .select()
      .single();

    if (vocabError) {
      res.status(500).json({ error: 'Failed to add word to vocabulary' });
      return;
    }

    res.status(201).json({
      message: 'Word added to vocabulary successfully',
      user_vocabulary: {
        id: userVocab.id,
        word_id: userVocab.word_id,
        mastery_level: userVocab.mastery_level,
        learned_at: userVocab.learned_at
      }
    });
  } catch (error) {
    console.error('Learn vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/books/vocabulary/learned', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    const { data: learnedWords, error } = await supabase
      .from('user_vocabulary')
      .select (
        `*,
        vocabulary_words (
          id,
          word,
          definition,
          pronunciation,
          example_sentence,
          difficulty_level
        )`
      )
      .eq('user_id', userId)
      .order('learned_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch learned vocabulary' });
      return;
    }

    res.json({
      learned_words: learnedWords || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get learned vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/books/evaluate-pronunciation', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { transcript, targetText, confidence } = req.body;

    if (!transcript || !targetText) {
      res.status(400).json({ error: 'Transcript and target text are required' });
      return;
    }

    // Enhanced pronunciation evaluation using OpenAI
    let openaiResponse;
    try {
      // Check if OpenAI configuration is available and valid
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing or invalid, falling back to basic evaluation');
        const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
        res.json(basicEvaluation);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an English pronunciation tutor. Analyze the spoken text compared to the target text and provide detailed feedback. Return a JSON response with pronunciation_score (0-100), fluency_score (0-100), accuracy_score (0-100), and suggestions array.'
              },
              {
                role: 'user',
                content: `Target text: \"${targetText}\"\nSpoken text: \"${transcript}\"\nSpeech recognition confidence: ${confidence || 0.8}\n\nPlease evaluate the pronunciation, fluency, and accuracy. Provide specific suggestions for improvement.`
              }
            ],
            max_tokens: 500,
            temperature: 0.3
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (abortError) {
        clearTimeout(timeoutId);
        throw abortError;
      }
    } catch (fetchError) {
      console.error('OpenAI API fetch error:', fetchError);
      // Fallback to basic evaluation on network error
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
      return;
    }

    if (!openaiResponse.ok) {
      console.error('OpenAI API error:', await openaiResponse.text());
      // Fallback to basic evaluation
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
      return;
    }

    const openaiResult = await openaiResponse.json();
    const aiContent = openaiResult.choices[0]?.message?.content;

    try {
      const evaluation = JSON.parse(aiContent);
      res.json({
        pronunciation_score: Math.min(100, Math.max(0, evaluation.pronunciation_score || 70)),
        fluency_score: Math.min(100, Math.max(0, evaluation.fluency_score || 70)),
        accuracy_score: Math.min(100, Math.max(0, evaluation.accuracy_score || 70)),
        suggestions: evaluation.suggestions || ['Keep practicing to improve your pronunciation!']
      });
    } catch (parseError) {
      // Fallback to basic evaluation if AI response is not valid JSON
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
    }
  } catch (error) {
    console.error('Pronunciation evaluation error:', error);
    // Fallback to basic evaluation
    const basicEvaluation = evaluateBasicPronunciation(req.body.transcript, req.body.targetText, req.body.confidence || 0.8);
    res.json(basicEvaluation);
  }
});

// Helper function for basic pronunciation evaluation
function evaluateBasicPronunciation(transcript: string, targetText: string, confidence: number) {
  const targetWords = targetText.toLowerCase().replace(/[.,!?;]/g, '').split(' ');
  const spokenWords = transcript.toLowerCase().replace(/[.,!?;]/g, '').split(' ');
  
  // Calculate accuracy based on word matching
  let correctWords = 0;
  const minLength = Math.min(spokenWords.length, targetWords.length);
  
  for (let i = 0; i < minLength; i++) {
    if (spokenWords[i] === targetWords[i]) {
      correctWords++;
    }
  }
  
  const accuracy = (correctWords / targetWords.length) * 100;
  const pronunciation = confidence * 100;
  const fluency = Math.max(0, 100 - Math.abs(spokenWords.length - targetWords.length) * 10);
  
  // Generate suggestions
  const suggestions = [];
  if (accuracy < 80) {
    suggestions.push('Try to pronounce each word clearly and distinctly');
  }
  if (pronunciation < 70) {
    suggestions.push('Speak more confidently and clearly');
  }
  if (fluency < 70) {
    suggestions.push('Try to match the rhythm and pace of natural speech');
  }
  if (suggestions.length === 0) {
    suggestions.push('Great job! Keep practicing to improve further.');
  }
  
  return {
    pronunciation_score: Math.round(pronunciation),
    fluency_score: Math.round(fluency),
    accuracy_score: Math.round(accuracy),
    suggestions
  };
}

router.post('/books/analyze-image', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { image_url, page_id, context } = req.body;

    if (!image_url) {
      res.status(400).json({ error: 'Image URL is required' });
      return;
    }

    // Enhanced image analysis using OpenAI Vision models
    const fallbackAnalysis = () => ({
      description: generateBasicImageDescription(image_url, context),
      vocabulary: []
    });

    let analysisResult: { description: string; vocabulary: Array<any> } | null = null;
    let usedFallback = false;
    const fallbackReasons: string[] = [];

    const ensureFallback = (reason: string) => {
      fallbackReasons.push(reason);
      console.warn(reason);
      if (!usedFallback) {
        usedFallback = true;
        analysisResult = fallbackAnalysis();
      }
    };

    const openAiAvailable = hasValidOpenAIConfig();

    if (!openAiAvailable) {
      ensureFallback('OpenAI configuration missing or invalid, using basic image description.');
    } else {
      try {
        const controller = new AbortController();
        const visionTimeoutRaw = process.env.OPENAI_VISION_TIMEOUT_MS;
        const parsedTimeout = visionTimeoutRaw ? Number.parseInt(visionTimeoutRaw, 10) : Number.NaN;
        const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
          ? parsedTimeout
          : DEFAULT_OPENAI_VISION_TIMEOUT_MS;

        const openaiVisionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4-turbo';
        const inlineImageUrl = await getInlineImageUrl(image_url);
        const openaiImageSource = inlineImageUrl ?? image_url;

        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          console.warn(`OpenAI Vision API timeout after ${elapsed}ms (limit: ${timeoutMs}ms)`);
          controller.abort();
        }, timeoutMs);

        try {
          const openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: openaiVisionModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are an educational assistant for children learning English. Provide a detailed, age-appropriate description for this book page.'
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Please describe this children\'s book page image clearly and engagingly. Focus on characters, actions, setting, and any educational details.'
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: openaiImageSource,
                        detail: inlineImageUrl ? undefined : 'auto'
                      }
                    }
                  ]
                }
              ],
              max_tokens: 512,
              temperature: 0.3
            }),
            signal: controller.signal
          });

          const elapsed = Date.now() - startTime;
          console.log(`OpenAI Vision API request completed in ${elapsed}ms`);
          clearTimeout(timeoutId);

          if (!openaiResponse.ok) {
            console.error('OpenAI Vision API error:', await openaiResponse.text());
            ensureFallback('OpenAI Vision API returned a non-200 response.');
          } else {
            const openaiResult = await openaiResponse.json();
            const rawContent = openaiResult.choices?.[0]?.message?.content;

            const extractContentString = (content: unknown): string | null => {
              if (!content) return null;
              if (typeof content === 'string') return content;
              if (Array.isArray(content)) {
                return content
                  .map(part => {
                    if (typeof part === 'string') return part;
                    if (typeof part === 'object' && part && 'text' in part) {
                      return String((part as { text?: string }).text ?? '');
                    }
                    return '';
                  })
                  .join('\n')
                  .trim() || null;
              }
              return null;
            };

            const cleanedContent = extractContentString(rawContent)
              ?.replace(/```json|```/g, '')
              .trim();

            if (!cleanedContent) {
              console.error('OpenAI Vision response did not contain content.');
              ensureFallback('OpenAI Vision response missing content.');
            } else {
              const detailedDescription = cleanedContent.trim();
              if (!detailedDescription) {
                ensureFallback('OpenAI Vision description was empty after trimming.');
              } else {
                analysisResult = {
                  description: detailedDescription,
                  vocabulary: []
                };
              }
            }
          }
        } catch (fetchError) {
          const elapsed = Date.now() - startTime;
          console.error(`OpenAI Vision API aborted after ${elapsed}ms:`, fetchError);
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error('This error occurred due to request timeout. Consider increasing OPENAI_VISION_TIMEOUT_MS environment variable.');
          }
          ensureFallback('OpenAI Vision API request failed.');
        }
      } catch (error) {
        console.error('Unexpected error while performing OpenAI analysis:', error);
        ensureFallback('Unexpected error during OpenAI analysis.');
      }
    }

    if (!analysisResult) {
      ensureFallback('OpenAI analysis did not produce a result.');
    }

    const { description, vocabulary } = analysisResult!;

    if (page_id && description) {
      const { error: updateError } = await supabase
        .from('book_pages')
        .update({ image_description: description })
        .eq('id', page_id);

      if (updateError) {
        console.error('Failed to update page with image description:', updateError);
      }
    }

    res.json({
      description,
      vocabulary,
      updated_page: !!page_id,
      used_fallback: usedFallback,
      fallback_reasons: usedFallback ? fallbackReasons : []
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    // Fallback to basic description
    const basicDescription = generateBasicImageDescription(req.body.image_url, req.body.context);
    res.json({ description: basicDescription, vocabulary: [] });
  }
});

router.get('/books/pages/:pageId/glossary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { pageId } = req.params;

    const { data, error } = await supabase
      .from('page_glossary_entries')
      .select('*')
      .eq('page_id', pageId)
      .order('confidence', { ascending: false })
      .order('word', { ascending: true });

    if (error) {
      console.error('Failed to fetch page glossary entries:', error);
      res.status(500).json({ error: 'Failed to fetch glossary entries' });
      return;
    }

    res.json({ entries: data ?? [] });
  } catch (error) {
    console.error('Unexpected glossary fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/books/pages/:pageId/glossary/analyze',
  authenticateToken,
  requireRole(['parent', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { pageId } = req.params;
      const { max_entries = 6, refresh = true } = req.body ?? {};
      const requester = (req as any).user as { userId: string; role: string } | undefined;

      if (!requester || !requester.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { data: page, error: pageError } = await supabase
        .from('book_pages')
        .select('id, book_id, page_number, image_url, text_content')
        .eq('id', pageId)
        .single();

      if (pageError || !page) {
        res.status(404).json({ error: 'Book page not found' });
        return;
      }

      if (!page.image_url) {
        res.status(400).json({ error: 'Page is missing an image to analyze' });
        return;
      }

      const { data: book, error: bookError } = await supabase
        .from('books')
        .select('id, title, difficulty_level, target_age_min, target_age_max')
        .eq('id', page.book_id)
        .single();

      if (bookError || !book) {
        res.status(404).json({ error: 'Book not found for the requested page' });
        return;
      }

      const openAiAvailable = hasValidOpenAIConfig();
      const inlineImageUrl = openAiAvailable ? await getInlineImageUrl(page.image_url) : null;
      const imageSource = inlineImageUrl ?? page.image_url;

      interface AiGlossaryEntry {
        word: string;
        definition: string;
        translation: string;
        difficulty?: string;
        confidence?: number;
        bounding_box?: { top?: number; left?: number; width?: number; height?: number };
        notes?: string;
      }

      let aiEntries: AiGlossaryEntry[] = [];
      const metadata: Record<string, unknown> = {
        book_title: book.title,
        page_number: page.page_number,
        inline_image_used: Boolean(inlineImageUrl)
      };

      if (openAiAvailable) {
        const controller = new AbortController();
        const timeoutRaw = process.env.OPENAI_VISION_TIMEOUT_MS;
        const glossaryTimeoutRaw = process.env.OPENAI_GLOSSARY_TIMEOUT_MS;
        const parsedTimeout = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : Number.NaN;
        const parsedGlossaryTimeout = glossaryTimeoutRaw ? Number.parseInt(glossaryTimeoutRaw, 10) : Number.NaN;
        // Use a longer timeout for glossary analysis as it's more complex than other vision tasks
        const baseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_OPENAI_VISION_TIMEOUT_MS;
        const glossaryTimeoutMs = Number.isFinite(parsedGlossaryTimeout) && parsedGlossaryTimeout > 0 ? parsedGlossaryTimeout : 300_000;
        const timeoutMs = Math.max(baseTimeoutMs, glossaryTimeoutMs); // Configurable minimum for glossary analysis

        const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

        const promptInstruction = `You are assisting a parent who supports an English learner at the primary school level. ` +
          `Analyze the provided book page image and identify up to ${max_entries} English words or short phrases that a primary school student might find challenging. ` +
          `You must respond with a single JSON object matching this schema: { "entries": [ { "word": string, ` +
          `"definition": string, "translation": string, "difficulty": "beginner" | "intermediate" | "advanced" | "challenging", ` +
          `"confidence": number between 0 and 1, "bounding_box": { "top": number, "left": number, "width": number, "height": number }, "notes"?: string } ] }. ` +
          `IMPORTANT: All bounding_box coordinates must be normalized between 0 and 1 relative to the image dimensions. ` +
          `For example, if a word is at the top-left corner, use top: 0, left: 0. If at bottom-right, use top: 0.9, left: 0.9. ` +
          `Width and height should also be normalized (e.g., width: 0.1 means 10% of image width). ` +
          `All floating point numbers must use a dot decimal (.) and at most three decimals. Do not include any explanatory text before or after the JSON.`;

        const messages = [
          {
            role: 'system',
            content: 'You are an expert children\'s reading coach and bilingual assistant.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: promptInstruction },
              {
                type: 'text',
                text: `Book: ${book.title}. Difficulty: ${book.difficulty_level}. Target age: ${book.target_age_min}-${book.target_age_max}. Page: ${page.page_number}.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageSource,
                  detail: inlineImageUrl ? undefined : 'high'
                }
              }
            ]
          }
        ];

        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        try {
          const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: visionModel,
              messages,
              max_tokens: 1500, // Increased from 700 to allow for complete glossary responses
              temperature: 0.2,
              response_format: {
                type: 'json_object'
              }
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`Glossary analysis call completed in ${elapsed}ms`);

          if (!response.ok) {
            console.error('OpenAI glossary analysis error:', await response.text());
            metadata.api_error = true;
          } else {
            const result = await response.json();
            const message = result.choices?.[0]?.message ?? null;
            let structuredPayload: unknown = null;

            if (message && message.content) {
              console.log('Raw AI response content length:', message.content.length);
              console.log('Raw AI response content preview:', message.content.substring(0, 200));
              
              // Check if the response seems complete (should end with proper JSON structure)
              const content = message.content.trim();
              if (!content.endsWith('}') && !content.endsWith(']}')) {
                console.log('Response appears to be incomplete - missing closing braces');
                console.log('Response ends with:', content.slice(-50)); // Show last 50 chars
                metadata.incomplete_response = true;
              }
              
              try {
                structuredPayload = JSON.parse(message.content);
              } catch (parseError) {
                console.error('Unable to parse glossary AI response:', parseError);
                console.log('Failed content:', message.content);
                metadata.json_parse_error = true;
                
                // Attempt to clean up the string if parsing fails
                const cleanedContent = message.content.replace(/```json|```/g, '').trim();
                console.log('Cleaned content preview:', cleanedContent.substring(0, 200));
                
              try {
                  structuredPayload = JSON.parse(cleanedContent);
                  console.log('Successfully parsed cleaned content');
              } catch (finalParseError) {
                  console.error('Unable to parse cleaned glossary AI response:', finalParseError);
                  console.log('Final failed content:', cleanedContent);
                  metadata.final_parse_error = true;

                  const repaired = attemptRepairJsonResponse(cleanedContent);
                  if (repaired) {
                    try {
                      structuredPayload = JSON.parse(repaired);
                      metadata.repaired_response = true;
                      console.log('Successfully repaired and parsed AI response');
                    } catch (repairParseError) {
                      console.error('Repaired AI response still failed to parse:', repairParseError);
                    }
                  }
                }
              }
          } else {
            console.log('No message content received from AI response');
            console.log('Full result:', JSON.stringify(result, null, 2));
            metadata.no_content = true;
          }

            const maybeEntries = structuredPayload && Array.isArray((structuredPayload as any).entries)
              ? (structuredPayload as any).entries
              : Array.isArray(structuredPayload)
                ? structuredPayload
                : [];

            if (Array.isArray(maybeEntries) && maybeEntries.length > 0) {
              aiEntries = maybeEntries
                .map((entry: any) => ({
                  word: typeof entry?.word === 'string' ? entry.word.trim() : '',
                  definition: typeof entry?.definition === 'string' ? entry.definition.trim() : '',
                  translation: typeof entry?.translation === 'string' ? entry.translation.trim() : '',
                  difficulty: entry?.difficulty,
                  confidence: entry?.confidence,
                  bounding_box: entry?.bounding_box,
                  notes: typeof entry?.notes === 'string' ? entry.notes : undefined
                }))
                .filter(entry => entry.word && entry.definition && entry.translation);
            }
          }
        } catch (error) {
          clearTimeout(timeoutId);
          console.error('Glossary analysis request failed:', error);
          
          // Check if the error was due to timeout/abort
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('Request was aborted due to timeout');
            metadata.timeout_occurred = true;
          } else {
            console.log('Request failed with error:', error);
            metadata.request_error = error instanceof Error ? error.message : String(error);
          }
        }
      }

      if (!aiEntries.length) {
        aiEntries = generateFallbackGlossaryFromText(page.text_content, max_entries);
        metadata.fallback_used = true;
      }

      if (!aiEntries.length) {
        res.status(200).json({ message: 'No glossary entries identified', entries: [] });
        return;
      }

      if (refresh) {
        const { error: deleteError } = await supabase
          .from('page_glossary_entries')
          .delete()
          .eq('page_id', pageId);

        if (deleteError) {
          console.error('Failed to clear previous glossary entries:', deleteError);
        }
      }

      const mappedEntries = aiEntries.slice(0, max_entries).map((entry, index) => {
        const fallbackPosition = createFallbackPosition(index, aiEntries.length);

        const top = entry.bounding_box?.top;
        const left = entry.bounding_box?.left;
        const width = entry.bounding_box?.width;
        const height = entry.bounding_box?.height;

        console.log(`[Glossary Debug] Entry "${entry.word}" raw bounding box:`, { top, left, width, height });

        // Use normalized coordinates directly from AI (0-1 range) with clamping
        const normalizedPosition = entry.bounding_box ? {
          top: Math.max(0, Math.min(1, typeof top === 'number' ? top : fallbackPosition.top)),
          left: Math.max(0, Math.min(1, typeof left === 'number' ? left : fallbackPosition.left)),
          width: Math.max(0.04, Math.min(1, typeof width === 'number' ? width : 0.18)),
          height: Math.max(0.04, Math.min(1, typeof height === 'number' ? height : 0.1))
        } : fallbackPosition;

        console.log(`[Glossary Debug] Entry "${entry.word}" normalized position:`, normalizedPosition);

        return {
          page_id: pageId,
          word: entry.word,
          definition: entry.definition,
          translation: entry.translation,
          difficulty: normalizeDifficulty(entry.difficulty),
          confidence: clamp01(entry.confidence, 0.6),
          position: normalizedPosition,
          metadata: {
            ...metadata,
            notes: entry.notes,
            source: openAiAvailable ? 'openai-vision' : 'fallback-text',
            raw_bounding_box: entry.bounding_box ?? null
          },
          created_by: requester.userId
        };
      });

      const { data: inserted, error: insertError } = await supabase
        .from('page_glossary_entries')
        .insert(mappedEntries)
        .select('*');

      if (insertError) {
        console.error('Failed to store glossary entries:', insertError);
        res.status(500).json({ error: 'Failed to store glossary entries' });
        return;
      }

      res.json({
        message: 'Glossary generated successfully',
        entries: inserted,
        used_fallback: metadata.fallback_used === true,
        total: inserted?.length ?? 0
      });
    } catch (error) {
      console.error('Unexpected glossary analysis error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post('/books/:bookId/analyze-images', authenticateToken, requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { force_reanalyze = false } = req.body;

    // Get all pages for the book
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('id, page_number, image_url, image_description')
      .eq('book_id', bookId)
      .order('page_number', { ascending: true });

    if (pagesError || !pages) {
      res.status(404).json({ error: 'Book pages not found' });
      return;
    }

    const results = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      // Skip if already has description and not forcing reanalysis
      if (page.image_description && !force_reanalyze) {
        skipped++;
        continue;
      }

      try {
        // Analyze image (reuse the logic from single image analysis)
        const analysisResponse = await fetch(`${req.protocol}://${req.get('host')}/api/books/analyze-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || ''
          },
          body: JSON.stringify({
            image_url: page.image_url,
            page_id: page.id,
            context: `Page ${page.page_number} from children's book`
          })
        });

        if (analysisResponse.ok) {
          const analysis = await analysisResponse.json();
          results.push({
            page_id: page.id,
            page_number: page.page_number,
            description: analysis.description,
            vocabulary: analysis.vocabulary
          });
          processed++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error(`Error analyzing page ${page.page_number}:`, error);
        errors++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      message: 'Batch image analysis completed',
      summary: {
        total_pages: pages.length,
        processed,
        skipped,
        errors
      },
      results
    });
  } catch (error) {
    console.error('Batch image analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for basic image description
function generateBasicImageDescription(_imageUrl: string, context?: string): string {
  const contextDescriptions = {
    'cover': 'This is the cover of a children\'s book with colorful illustrations.',
    'story': 'This page shows an illustration from the story with characters and scenes.',
    'educational': 'This educational illustration helps children learn new concepts.',
    'default': 'This image shows an interesting scene that helps tell the story.'
  };

  const contextKey = context?.toLowerCase() || 'default';
  return contextDescriptions[contextKey as keyof typeof contextDescriptions] || contextDescriptions.default;
}

router.post('/books/extract-vocabulary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, difficulty_level = 'beginner', max_words = 5 } = req.body;
    const { userId } = (req as any).user;

    if (!description) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }

    let extractedVocabulary = [];

    try {
      // Check if OpenAI configuration is available
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing, using basic vocabulary extraction');
        extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
      } else {
        // Use OpenAI for intelligent vocabulary extraction
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        let openaiResponse;
        try {
          openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [
                {
                  role: 'system',
                  content: `You are an educational assistant for children learning English. Extract ${max_words} key vocabulary words from the given description that are appropriate for ${difficulty_level} level learners. Return a JSON array of objects with "word", "definition", "difficulty_level", "part_of_speech", and "example_sentence" fields.`
                },
                {
                  role: 'user',
                  content: `Extract educational vocabulary from this description: \"${description}\". Focus on words that children can learn and use in their daily conversations.`
                }
              ],
              max_tokens: 500,
              temperature: 0.3
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (abortError) {
          clearTimeout(timeoutId);
          throw abortError;
        }

        if (openaiResponse.ok) {
          const openaiResult = await openaiResponse.json();
          const aiContent = openaiResult.choices[0]?.message?.content;
          
          try {
            extractedVocabulary = JSON.parse(aiContent);
          } catch (parseError) {
            console.error('Failed to parse AI vocabulary response:', parseError);
            extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
          }
        } else {
          extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
        }
      }
    } catch (error) {
      console.error('Vocabulary extraction error:', error);
      extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
    }

    // Store extracted vocabulary in database
    const vocabularyToStore = [];
    for (const vocab of extractedVocabulary) {
      try {
        // Check if word already exists
        const { data: existingWord } = await supabase
          .from('vocabulary_words')
          .select('id')
          .eq('word', vocab.word.toLowerCase())
          .single();

        if (!existingWord) {
          // Insert new vocabulary word
          const { data: newWord, error: insertError } = await supabase
            .from('vocabulary_words')
            .insert({
              word: vocab.word.toLowerCase(),
              definition: vocab.definition,
              difficulty_level: vocab.difficulty_level || difficulty_level,
              part_of_speech: vocab.part_of_speech || 'noun',
              example_sentence: vocab.example_sentence || `This is an example with ${vocab.word}.`,
              created_by: userId
            })
            .select()
            .single();

          if (!insertError && newWord) {
            vocabularyToStore.push(newWord);
          }
        } else {
          vocabularyToStore.push({ id: existingWord.id, ...vocab });
        }
      } catch (error) {
        console.error('Error storing vocabulary word:', vocab.word, error);
      }
    }

    res.json({
      message: `Extracted ${extractedVocabulary.length} vocabulary words`,
      vocabulary: extractedVocabulary,
      stored_count: vocabularyToStore.length
    });
  } catch (error) {
    console.error('Extract vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for basic vocabulary extraction
function extractBasicVocabulary(description: string, difficultyLevel: string, maxWords: number) {
  // Simple word extraction based on common patterns
  const words = description.toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(' ')
    .filter(word => word.length > 3 && word.length < 12)
    .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there', 'could', 'other', 'more', 'very', 'what', 'know', 'just', 'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life', 'only', 'can', 'still', 'should', 'after', 'being', 'now', 'made', 'before', 'here', 'through', 'when', 'where', 'much', 'some', 'these', 'many', 'then', 'them', 'well', 'were'].includes(word));

  // Get unique words and limit to maxWords
  const uniqueWords = [...new Set(words)].slice(0, maxWords);
  
  return uniqueWords.map(word => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    definition: `A word that appears in the story: ${word}`,
    difficulty_level: difficultyLevel,
    part_of_speech: 'noun',
    example_sentence: `The story mentions ${word}.`
  }));
}

router.post('/books/discuss', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { book_id, page_number, message, conversation_history = [] } = req.body;
    const { userId } = (req as any).user;

    // Validate required fields
    if (!book_id || !message) {
      res.status(400).json({ error: 'Book ID and message are required' });
      return;
    }

    // Get book and page information for context
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', book_id)
      .eq('is_public', true)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    let pageContext = '';
    if (page_number) {
      const { data: page, error: pageError } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', book_id)
        .eq('page_number', page_number)
        .single();

      if (!pageError && page) {
        pageContext = `\nCurrent page ${page_number}: \"${page.text_content}\"`;
        if (page.ai_description) {
          pageContext += `\nPage illustration: ${page.ai_description}`;
        }
      }
    }

    let aiResponse = '';

    try {
      // Check if OpenAI configuration is available
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing, using fallback response');
        aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
      } else {
        // Build conversation context
        const messages = [
          {
            role: 'system',
            content: `You are a friendly AI tutor helping children discuss and understand books. You're discussing \"${book.title}\" - ${book.description}. Target age: ${book.target_age_min}-${book.target_age_max} years. Difficulty: ${book.difficulty_level}.\n\nGuidelines:\n- Use age-appropriate language\n- Be encouraging and positive\n- Ask follow-up questions to promote thinking\n- Help with vocabulary and comprehension\n- Make learning fun and engaging\n- Keep responses concise but helpful${pageContext}`
          },
          ...conversation_history.slice(-6), // Keep last 6 messages for context
          {
            role: 'user',
            content: message
          }
        ];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        let openaiResponse;
        try {
          openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || 'gpt-4',
              messages,
              max_tokens: 300,
              temperature: 0.7
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (abortError) {
          clearTimeout(timeoutId);
          throw abortError;
        }

        if (openaiResponse.ok) {
          const openaiResult = await openaiResponse.json();
          aiResponse = openaiResult.choices[0]?.message?.content || 'I\'m sorry, I couldn\'t understand that. Could you ask me something else about the book?';
        } else {
          aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
        }
      }
    } catch (error) {
      console.error('AI discussion error:', error);
      aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
    }

    // Save discussion to database (optional - for tracking)
    try {
      await supabase
        .from('book_discussions')
        .insert({
          user_id: userId,
          book_id,
          page_number,
          user_message: message,
          ai_response: aiResponse,
          created_at: new Date().toISOString()
        });
    } catch (dbError) {
      console.error('Failed to save discussion:', dbError);
      // Continue even if saving fails
    }

    res.json({
      message: 'Discussion response generated',
      response: aiResponse,
      book_title: book.title,
      page_number: page_number || null
    });
  } catch (error) {
    console.error('Book discussion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for fallback discussion responses
function generateFallbackDiscussionResponse(message: string, book: any, _pageContext: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Simple pattern matching for common questions
  if (lowerMessage.includes('what') && (lowerMessage.includes('happen') || lowerMessage.includes('story'))) {
    return `That's a great question about \"${book.title}\"! This story is about ${book.description}. What part of the story interests you the most?`;
  }
  
  if (lowerMessage.includes('who') && (lowerMessage.includes('character') || lowerMessage.includes('main'))) {
    return `The characters in \"${book.title}\" are really interesting! This book is designed for children aged ${book.target_age_min}-${book.target_age_max}. Can you tell me which character you like best?`;
  }
  
  if (lowerMessage.includes('why') || lowerMessage.includes('how')) {
    return `That's a thoughtful question! \"${book.title}\" has many interesting parts to explore. What made you think about that? I'd love to hear your ideas!`;
  }
  
  if (lowerMessage.includes('word') || lowerMessage.includes('mean')) {
    return `Great question about vocabulary! Learning new words is so important. Can you tell me which word you'd like to understand better? I can help explain it!`;
  }
  
  if (lowerMessage.includes('like') || lowerMessage.includes('favorite')) {
    return `I love hearing about your favorites! \"${book.title}\" has so many wonderful parts. What do you like most about this story?`;
  }
  
  // Default response
  return `That's an interesting thought about \"${book.title}\"! This ${book.difficulty_level} level book has lots to discover. Can you tell me more about what you're thinking?`;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Chat Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

router.post('/chat/lesson', ...lessonChatHandler);
router.post('/chat/speaking-practice', ...speakingPracticeChatHandler);


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Dashboard Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

router.use('/dashboard', authenticateToken);

router.get('/dashboard/students', async (_req: Request, res: Response) => {
  try {
    const { data: students, error } = await supabase
      .from('users')
      .select (
        `id,
        full_name,
        email,
        created_at,
        reading_sessions (
          id,
          duration,
          words_read,
          comprehension_score,
          created_at
        ),
        speaking_sessions (
          id,
          duration,
          pronunciation_score,
          fluency_score,
          accuracy_score,
          created_at
        ),
        user_vocabulary (
          id,
          learned_at
        )`
      )
      .eq('role', 'child');

    if (error) {
      console.error('Error fetching students:', error);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }

    // Transform data to match frontend interface
    const transformedStudents = students?.map(student => {
      const readingSessions = student.reading_sessions || [];
      const speakingSessions = student.speaking_sessions || [];
      const vocabularyWords = student.user_vocabulary || [];

      const totalReadingTime = readingSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const booksCompleted = readingSessions.length;
      const vocabularyLearned = vocabularyWords.length;
      
      const avgComprehensionScore = readingSessions.length > 0 
        ? readingSessions.reduce((sum, session) => sum + (session.comprehension_score || 0), 0) / readingSessions.length
        : 0;
      
      const avgSpeakingScore = speakingSessions.length > 0
        ? speakingSessions.reduce((sum, session) => {
            const sessionAvg = ((session.pronunciation_score || 0) + (session.fluency_score || 0) + (session.accuracy_score || 0)) / 3;
            return sum + sessionAvg;
          }, 0) / speakingSessions.length
        : 0;
      
      const averageScore = Math.round((avgComprehensionScore + avgSpeakingScore) / 2);
      
      // Determine level based on performance
      let level = 'Beginner';
      if (averageScore >= 80) level = 'Advanced';
      else if (averageScore >= 60) level = 'Intermediate';
      
      const lastSession = [...readingSessions, ...speakingSessions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      
      const lastActive = lastSession 
        ? new Date(lastSession.created_at).toLocaleDateString()
        : new Date(student.created_at).toLocaleDateString();

      return {
        id: student.id,
        name: student.full_name,
        email: student.email,
        age: 8, // Default age, could be added to user profile
        level,
        totalReadingTime,
        booksCompleted,
        vocabularyLearned,
        lastActive,
        averageScore
      };
    }) || [];

    res.json(transformedStudents);
  } catch (error) {
    console.error('Error in /students route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard/lessons', async (_req: Request, res: Response) => {
  try {
    const { data: lessons, error } = await supabase
      .from('lesson_plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lessons:', error);
      return res.status(500).json({ error: 'Failed to fetch lessons' });
    }

    // Transform to frontend shape to match LessonPlan interface
    const transformed = (lessons || []).map((lesson: any) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      targetLevel: lesson.target_level,
      duration: lesson.duration,
      objectives: lesson.objectives || [],
      activities: lesson.activities || [],
      assignedStudents: lesson.assigned_students || [],
      bookIds: lesson.book_ids || [],
      createdAt: lesson.created_at,
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Error in /lessons route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard/my-lessons', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // First, fetch the lessons assigned to this student
    const { data: lessons, error } = await supabase
      .from('lesson_plans')
      .select('*')
      .contains('assigned_students', [userId])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching student lessons:', error);
      return res.status(500).json({ error: 'Failed to fetch assigned lessons' });
    }

    // For each lesson, fetch the associated books
    const transformedLessons = await Promise.all(
      (lessons || []).map(async (lesson) => {
        let books: Pick<Book, 'id' | 'title' | 'author' | 'cover_image_url'>[] = [];
        
        if (lesson.book_ids && lesson.book_ids.length > 0) {
          const { data: bookData, error: bookError } = await supabase
            .from('books')
            .select('id, title, author, cover_image_url')
            .in('id', lesson.book_ids);
          
          if (!bookError) {
            books = bookData || [];
          }
        }

        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          targetLevel: lesson.target_level,
          duration: lesson.duration,
          objectives: lesson.objectives,
          activities: lesson.activities,
          assignedStudents: lesson.assigned_students,
          bookIds: lesson.book_ids,
          books: books,
          createdAt: lesson.created_at
        };
      })
    );

    res.json(transformedLessons);
  } catch (error) {
    console.error('Error in /my-lessons route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/dashboard/lessons', async (req: Request, res: Response) => {
  try {
    const { title, description, targetLevel, duration, objectives, activities, assignedStudents, bookIds } = req.body;
    
    if (!title || !description || !targetLevel || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: lesson, error } = await supabase
      .from('lesson_plans')
      .insert({
        title,
        description,
        target_level: targetLevel,
        duration,
        objectives: objectives || [],
        activities: activities || [],
        assigned_students: assignedStudents || [],
        book_ids: bookIds || [],
        created_by: req.user?.userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating lesson:', error);
      return res.status(500).json({ error: 'Failed to create lesson' });
    }

    // Transform response to match frontend interface
    const transformedLesson = {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      targetLevel: lesson.target_level,
      duration: lesson.duration,
      objectives: lesson.objectives,
      activities: lesson.activities,
      assignedStudents: lesson.assigned_students,
      bookIds: lesson.book_ids,
      createdAt: lesson.created_at
    };

    res.status(201).json(transformedLesson);
  } catch (error) {
    console.error('Error in POST /lessons route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/dashboard/lessons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, targetLevel, duration, objectives, activities, assignedStudents, bookIds } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (targetLevel !== undefined) updateData.target_level = targetLevel;
    if (duration !== undefined) updateData.duration = duration;
    if (objectives !== undefined) updateData.objectives = objectives;
    if (activities !== undefined) updateData.activities = activities;
    if (assignedStudents !== undefined) updateData.assigned_students = assignedStudents;
    if (bookIds !== undefined) updateData.book_ids = bookIds;

    const { data: lesson, error } = await supabase
      .from('lesson_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lesson:', error);
      return res.status(500).json({ error: 'Failed to update lesson' });
    }

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Transform response to match frontend interface
    const transformedLesson = {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      targetLevel: lesson.target_level,
      duration: lesson.duration,
      objectives: lesson.objectives,
      activities: lesson.activities,
      assignedStudents: lesson.assigned_students,
      bookIds: lesson.book_ids,
      createdAt: lesson.created_at
    };

    res.json(transformedLesson);
  } catch (error) {
    console.error('Error in PUT /lessons route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/dashboard/lessons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('lesson_plans')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting lesson:', error);
      return res.status(500).json({ error: 'Failed to delete lesson' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /lessons route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard/progress', async (_req: Request, res: Response) => {
  try {
    const { data: readingSessions, error: readingError } = await supabase
      .from('reading_sessions')
      .select('duration, words_read, comprehension_score, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: speakingSessions, error: speakingError } = await supabase
      .from('speaking_sessions')
      .select('pronunciation_score, fluency_score, accuracy_score, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: vocabularyCount, error: vocabError } = await supabase
      .from('user_vocabulary')
      .select('id', { count: 'exact' });

    if (readingError || speakingError || vocabError) {
      console.error('Error fetching progress data:', { readingError, speakingError, vocabError });
      return res.status(500).json({ error: 'Failed to fetch progress data' });
    }

    const progressData = {
      recentReadingSessions: readingSessions || [],
      recentSpeakingSessions: speakingSessions || [],
      totalVocabularyLearned: vocabularyCount || 0,
      lastUpdated: new Date().toISOString()
    };

    res.json(progressData);
  } catch (error) {
    console.error('Error in /progress route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dashboard/analytics', async (_req: Request, res: Response) => {
  try {
    // Get reading sessions data for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: readingSessions, error: readingError } = await supabase
      .from('reading_sessions')
      .select('duration, words_read, comprehension_score, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const { data: speakingSessions, error: speakingError } = await supabase
      .from('speaking_sessions')
      .select('pronunciation_score, fluency_score, accuracy_score, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const { data: vocabularyData, error: vocabError } = await supabase
      .from('user_vocabulary')
      .select('learned_at')
      .gte('learned_at', thirtyDaysAgo.toISOString())
      .order('learned_at', { ascending: true });

    if (readingError || speakingError || vocabError) {
      console.error('Error fetching analytics data:', { readingError, speakingError, vocabError });
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    // Group data by date
    const analyticsMap = new Map();
    
    // Process reading sessions
    readingSessions?.forEach(session => {
      const date = new Date(session.created_at).toISOString().split('T')[0];
      if (!analyticsMap.has(date)) {
        analyticsMap.set(date, {
          date,
          readingTime: 0,
          vocabularyLearned: 0,
          speakingScore: 0,
          speakingCount: 0
        });
      }
      const dayData = analyticsMap.get(date);
      dayData.readingTime += session.duration || 0;
    });

    // Process speaking sessions
    speakingSessions?.forEach(session => {
      const date = new Date(session.created_at).toISOString().split('T')[0];
      if (!analyticsMap.has(date)) {
        analyticsMap.set(date, {
          date,
          readingTime: 0,
          vocabularyLearned: 0,
          speakingScore: 0,
          speakingCount: 0
        });
      }
      const dayData = analyticsMap.get(date);
      const sessionScore = ((session.pronunciation_score || 0) + (session.fluency_score || 0) + (session.accuracy_score || 0)) / 3;
      dayData.speakingScore += sessionScore;
      dayData.speakingCount += 1;
    });

    // Process vocabulary data
    vocabularyData?.forEach(vocab => {
      const date = new Date(vocab.learned_at).toISOString().split('T')[0];
      if (!analyticsMap.has(date)) {
        analyticsMap.set(date, {
          date,
          readingTime: 0,
          vocabularyLearned: 0,
          speakingScore: 0,
          speakingCount: 0
        });
      }
      const dayData = analyticsMap.get(date);
      dayData.vocabularyLearned += 1;
    });

    // Convert to array and calculate averages
    const analyticsData = Array.from(analyticsMap.values()).map(day => ({
      date: day.date,
      readingTime: day.readingTime,
      vocabularyLearned: day.vocabularyLearned,
      speakingScore: day.speakingCount > 0 ? Math.round(day.speakingScore / day.speakingCount) : 0
    }));

    res.json(analyticsData);
  } catch (error) {
    console.error('Error in /analytics route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Regenerate Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

router.post('/books/:bookId/pages/:pageId/regenerate-description', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`Regenerating description for page ${req.params.pageId}`);
    const { pageId } = req.params;

    // 1. Fetch the page to get the image URL
    const { data: page, error: pageError } = await supabase
      .from('book_pages')
      .select('id, image_url')
      .eq('id', pageId)
      .single();

    if (pageError || !page) {
      res.status(404).json({ error: 'Book page not found' });
      return;
    }

    const { image_url } = page;

    // 2. Analyze the image with OpenAI
    let newDescription: string | null = null;
    let usedFallback = false;
    const { context } = req.body ?? {};

    try {
      if (!process.env.OPENAI_BASE_URL ||
          !process.env.OPENAI_API_KEY ||
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing or invalid during regeneration, falling back to basic description');
      } else {
        const controller = new AbortController();
        const visionTimeoutRaw = process.env.OPENAI_VISION_TIMEOUT_MS;
        const parsedTimeout = visionTimeoutRaw ? Number.parseInt(visionTimeoutRaw, 10) : Number.NaN;
        const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
          ? parsedTimeout
          : DEFAULT_OPENAI_VISION_TIMEOUT_MS;

        const openaiVisionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4-turbo';
        const inlineImageUrl = await getInlineImageUrl(image_url);
        const openaiImageSource = inlineImageUrl ?? image_url;

        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          console.warn(`OpenAI Vision API timeout during regeneration after ${elapsed}ms (limit: ${timeoutMs}ms)`);
          controller.abort();
        }, timeoutMs);

        try {
          const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: openaiVisionModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are an educational assistant for children learning English. Provide a detailed, age-appropriate description for this book page.'
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Please describe this children\'s book page image clearly and engagingly. Focus on characters, actions, setting, and any educational details.'
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: openaiImageSource,
                        detail: inlineImageUrl ? undefined : 'auto'
                      }
                    }
                  ]
                }
              ],
              max_tokens: 512,
              temperature: 0.3
            }),
            signal: controller.signal
          });
          const elapsed = Date.now() - startTime;
          console.log(`OpenAI Vision API request completed in ${elapsed}ms for regeneration`);
          clearTimeout(timeoutId);

          if (!response.ok) {
            console.error('OpenAI Vision API error during regeneration:', await response.text());
          } else {
            const openaiResult = await response.json();
            newDescription = openaiResult.choices[0]?.message?.content?.trim() || null;
          }
        } catch (fetchError) {
          const elapsed = Date.now() - startTime;
          console.error(`OpenAI Vision API aborted after ${elapsed}ms during regeneration:`, fetchError);
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error('Regeneration request timed out. Consider increasing OPENAI_VISION_TIMEOUT_MS.');
          }
        }
      }
    } catch (error) {
      console.error('Unexpected error during regeneration analysis:', error);
    }

    if (!newDescription) {
      newDescription = generateBasicImageDescription(image_url, context);
      usedFallback = true;
    }

    // 3. Update the page with the new description
    const { data: updatedPage, error: updateError } = await supabase
      .from('book_pages')
      .update({ image_description: newDescription })
      .eq('id', pageId)
      .select();

    if (updateError) {
      console.error('Failed to update page with new description:', updateError);
      res.status(500).json({ error: 'Failed to save new description' });
      return;
    }

    if (!updatedPage || updatedPage.length === 0) {
      console.error('No page was updated - page ID may not exist:', pageId);
      res.status(404).json({ error: 'Page not found or could not be updated' });
      return;
    }

    res.json({
      message: 'Description regenerated successfully',
      description: newDescription,
      updated_page: true,
      used_fallback: usedFallback
    });

  } catch (error) {
    console.error('Regenerate description error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Upload Routes
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const handleMulterError = (error: any, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  
  if (error && error.message === 'Invalid file type. Only JPG, PNG, and PDF files are allowed.') {
    return res.status(400).json({ error: error.message });
  }
  
  next(error);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 50 * 1024 * 1024, // 50MB field size limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF files are allowed.'));
    }
  }
});

const bookMetadataSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().optional(),
  target_age_min: Joi.number().integer().min(3).max(18).required(),
  target_age_max: Joi.number().integer().min(3).max(18).required(),
  difficulty_level: Joi.string().valid('beginner', 'intermediate', 'advanced').required(),
  category: Joi.string().optional(),
  language: Joi.string().default('en'),
  is_public: Joi.boolean().default(false)
}).options({ convert: true });

router.post('/upload/book', authenticateToken, requireRole(['parent', 'admin']), upload.single('file'), handleMulterError, async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if client disconnected
    if (req.destroyed || res.destroyed) {
      console.log('Client disconnected during upload');
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate metadata
    const { error: validationError, value } = bookMetadataSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { userId } = (req as any).user;
    const { title, description, target_age_min, target_age_max, difficulty_level, category, language, is_public } = value;
    
    // Generate unique filename
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
    const filePath = `books/${fileName}`;

    // Upload file to Supabase Storage
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from('book-files')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      res.status(500).json({ error: 'Failed to upload file' });
      return;
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('book-files')
      .getPublicUrl(filePath);

    // Create book record in database
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .insert({
        title,
        description,
        file_url: urlData.publicUrl,
        pdf_file_url: urlData.publicUrl, // Set pdf_file_url to satisfy NOT NULL constraint
        file_path: filePath,
        file_type: req.file.mimetype,
        target_age_min,
        target_age_max,
        difficulty_level,
        category,
        language,
        is_public,
        uploaded_by: userId
      })
      .select()
      .single();

    if (bookError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('book-files').remove([filePath]);
      console.error('Database error:', bookError);
      res.status(500).json({ error: 'Failed to create book record' });
      return;
    }

    res.status(201).json({
      message: 'Book uploaded successfully',
      book: {
        id: bookData.id,
        title: bookData.title,
        description: bookData.description,
        file_url: bookData.file_url,
        target_age_min: bookData.target_age_min,
        target_age_max: bookData.target_age_max,
        difficulty_level: bookData.difficulty_level,
        category: bookData.category,
        language: bookData.language,
        is_public: bookData.is_public,
        created_at: bookData.created_at
      }
    });
  } catch (error) {
    console.error('Upload book error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('ECONNABORTED') || error.message.includes('timeout')) {
        if (!res.headersSent) {
          res.status(408).json({ error: 'Upload timeout. Please try again with a smaller file or check your connection.' });
        }
        return;
      }
      
      if (error.message.includes('File too large')) {
        if (!res.headersSent) {
          res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        return;
      }
      
      if (error.message.includes('Invalid file type')) {
        if (!res.headersSent) {
          res.status(400).json({ error: error.message });
        }
        return;
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.patch('/upload/book/:bookId', authenticateToken, requireRole(['parent', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { userId, role } = (req as any).user;

    // Validate allowed fields (all optional)
    const updateSchema = Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().allow('').optional(),
      category: Joi.string().allow('').optional(),
      language: Joi.string().optional(),
      is_public: Joi.boolean().optional(),
      target_age_min: Joi.number().integer().min(3).max(18).optional(),
      target_age_max: Joi.number().integer().min(3).max(18).optional(),
      difficulty_level: Joi.string().valid('beginner', 'intermediate', 'advanced').optional()
    }).min(1);

    const { error: validationError, value: updates } = updateSchema.validate(req.body, { convert: true });
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    // Fetch book and verify ownership unless admin
    const { data: book, error: fetchError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (fetchError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (role !== 'admin' && book.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    // Ensure age range consistency if provided
    if (updates.target_age_min !== undefined && updates.target_age_max !== undefined) {
      if (updates.target_age_min > updates.target_age_max) {
        res.status(400).json({ error: 'target_age_min cannot be greater than target_age_max' });
        return;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('books')
      .update({ ...updates })
      .eq('id', bookId)
      .select('*')
      .single();

    if (updateError) {
      res.status(500).json({ error: 'Failed to update book' });
      return;
    }

    res.json({ message: 'Book updated', book: updated });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/upload/book/:bookId/pages', authenticateToken, requireRole(['parent', 'admin']), upload.array('pages', 50), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const files = req.files as Express.Multer.File [];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const { userId } = (req as any).user;

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (bookData.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const uploadedPages: Array<{ id: string; page_number: number; image_url: string; filename: string }> = [];
    const failedUploads: Array<{ filename: string; error: string }> = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Generate unique filename
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${i}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const filePath = `book-pages/${bookId}/${fileName}`;

        // Upload file to Supabase Storage
        const { data: _uploadData, error: uploadError } = await supabase.storage
          .from('book-files')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          failedUploads.push({ filename: file.originalname, error: uploadError.message });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('book-files')
          .getPublicUrl(filePath);

        // Analyze image with AI (optional, non-blocking)
        let imageDescription: string | null = null;
        try {
          // Import OpenAI configuration
          const openaiConfig = process.env.OPENAI_API_KEY ? {
            apiKey: process.env.OPENAI_API_KEY
          } : null;

          if (openaiConfig) {
            const { OpenAI } = await import('openai');
            const openai = new OpenAI(openaiConfig);
            
            const response = await openai.chat.completions.create({
              model: process.env.OPENAI_VISION_MODEL || 'gpt-4-turbo',
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Analyze this children\'s book page image. Provide a detailed, educational description suitable for English language learners. Focus on objects, characters, actions, and educational content. Keep it age-appropriate and engaging."
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 10000
            });
            
            imageDescription = response.choices[0]?.message?.content || null;
          }
        } catch (error) {
          console.log('AI image analysis failed, continuing without description:', error instanceof Error ? error.message : String(error));
          // Continue without description - this is optional
        }

        // Create page record
        const { data: pageData, error: pageError } = await supabase
          .from('book_pages')
          .insert({
            book_id: bookId,
            page_number: i + 1,
            image_url: urlData.publicUrl,
            image_description: imageDescription
          })
          .select()
          .single();

        if (pageError) {
          // Clean up uploaded file if database insert fails
          await supabase.storage.from('book-files').remove([filePath]);
          failedUploads.push({ filename: file.originalname, error: 'Database error' });
          continue;
        }

        uploadedPages.push({
          id: pageData.id,
          page_number: pageData.page_number,
          image_url: pageData.image_url,
          filename: file.originalname
        });
      } catch (error) {
        failedUploads.push({ filename: file.originalname, error: 'Processing error' });
      }
    }

    res.status(201).json({
      message: `Uploaded ${uploadedPages.length} pages successfully`,
      uploaded_pages: uploadedPages,
      failed_uploads: failedUploads,
      total_files: files.length,
      successful_uploads: uploadedPages.length,
      failed_uploads_count: failedUploads.length
    });
  } catch (error) {
    console.error('Upload pages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/upload/books', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    const { data: books, error } = await supabase
      .from('books')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch books' });
      return;
    }

    res.json({
      books: books || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/upload/book/:bookId', authenticateToken, requireRole(['parent', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { userId } = (req as any).user;

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by, file_path')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (bookData.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    // Get all book pages to delete their files
    const { data: pages } = await supabase
      .from('book_pages')
      .select('image_path')
      .eq('book_id', bookId);

    // Delete book pages from database
    await supabase
      .from('book_pages')
      .delete()
      .eq('book_id', bookId);

    // Delete book from database
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId);

    if (deleteError) {
      res.status(500).json({ error: 'Failed to delete book' });
      return;
    }

    // Delete files from storage
    const filesToDelete = [bookData.file_path];
    if (pages) {
      filesToDelete.push(...pages.map(page => page.image_path));
    }

    await supabase.storage
      .from('book-files')
      .remove(filesToDelete.filter(Boolean));

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
