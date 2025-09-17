import jwt from 'jsonwebtoken';
import { type User } from '../config/supabase';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Use string format for jsonwebtoken

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for a user
 */
export const generateToken = (user: User): string => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  // @ts-ignore - JWT accepts string format like '7d', '24h' etc.
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify and decode a JWT token
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

/**
 * Middleware to verify JWT token
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = extractTokenFromHeader(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Middleware to check if user can access child data (parent or the child themselves)
 */
export const canAccessChildData = async (req: any, res: any, next: any) => {
  const { userId } = req.params;
  const currentUser = req.user;

  if (!currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // User can access their own data
  if (currentUser.userId === userId) {
    return next();
  }

  // Parents can access their children's data
  if (currentUser.role === 'parent') {
    // This would need to be implemented with a database check
    // For now, we'll allow it and implement the check in the route handler
    return next();
  }

  // Admins can access all student data
  if (currentUser.role === 'admin') {
    return next();
  }

  return res.status(403).json({ error: 'Access denied' });
};