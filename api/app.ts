/**
 * Interactive English Tutor Express.js Application
 * Main application setup with routes and middleware
 */
import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import booksRoutes from './routes/books.js';
import achievementsRoutes from './routes/achievements.js';
import dashboardRoutes from './routes/dashboard.js';
import chatRoutes from './routes/chat.js';
import regenerateRoutes from './routes/regenerate.js';
import { runAllChecks } from './utils/health.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const app: express.Application = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] // Replace with your production domain
    : ['http://localhost:3000', 'http://localhost:5173'], // Development origins
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/books', regenerateRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);

/**
 * health
 */
app.use('/api/health', (req: Request, res: Response, next: NextFunction): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
    service: 'Interactive English Tutor API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Detailed health checks (env + Supabase connectivity)
app.get('/api/health/checks', async (_req: Request, res: Response) => {
  try {
    const results = await runAllChecks();
    res.status(results.ok ? 200 : 500).json({ success: results.ok, ...results });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Health checks failed' });
  }
});

// API documentation endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Interactive English Tutor API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'POST /api/auth/logout': 'Logout user',
        'GET /api/auth/me': 'Get current user profile',
        'PUT /api/auth/profile': 'Update user profile',
        'GET /api/auth/children': 'Get children (for parents)'
      },
      upload: {
        'POST /api/upload/book': 'Upload a picture book',
        'POST /api/upload/book/:bookId/pages': 'Upload book pages',
        'GET /api/upload/books': 'Get user uploaded books',
        'DELETE /api/upload/book/:bookId': 'Delete a book'
      },
      books: {
         'GET /api/books': 'Get all public books',
         'GET /api/books/:bookId': 'Get book by ID with pages',
         'POST /api/books/reading-session': 'Create reading session',
         'POST /api/books/speaking-session': 'Create speaking session',
         'GET /api/books/progress': 'Get user reading progress',
         'GET /api/books/reading-sessions': 'Get user reading sessions',
         'GET /api/books/speaking-sessions': 'Get user speaking sessions',
         'GET /api/books/vocabulary': 'Get vocabulary words',
         'POST /api/books/vocabulary/learn': 'Add word to user vocabulary',
         'GET /api/books/vocabulary/learned': 'Get user learned vocabulary'
       },
       achievements: {
         'GET /api/achievements': 'Get all achievements',
         'GET /api/achievements/user/:userId': 'Get user achievements',
         'POST /api/achievements/award': 'Award achievement to user',
         'DELETE /api/achievements/revoke': 'Revoke achievement from user',
         'GET /api/achievements/leaderboard': 'Get achievement leaderboard'
       },
       dashboard: {
         'GET /api/dashboard/students': 'Get student data with progress',
         'GET /api/dashboard/lessons': 'Get lesson plans',
         'POST /api/dashboard/lessons': 'Create lesson plan',
         'PUT /api/dashboard/lessons/:id': 'Update lesson plan',
         'DELETE /api/dashboard/lessons/:id': 'Delete lesson plan',
         'GET /api/dashboard/analytics': 'Get analytics data'
       },
       chat: {
         'POST /api/chat/lesson': 'AI chat for lesson-based tutoring with book context'
       }
    }
  });
});

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', error);
  
  // Multer errors
  if ((error as any).code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
  }
  
  if ((error as any).code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field.' });
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  // Default error
  res.status((error as any).status || 500).json({
    success: false,
    error: error.message || 'Server internal error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: '/api'
  });
});

export default app;