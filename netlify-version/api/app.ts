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
import apiRoutes from './router.js';
import { runAllChecks } from './utils/health.js';

// for esm mode - handle serverless environment where import.meta.url might be undefined
let __dirname: string;
try {
  if (import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    // Fallback for serverless/bundled environments
    __dirname = process.cwd();
  }
} catch (e) {
  // Fallback if fileURLToPath fails
  __dirname = process.cwd();
}

// load env from project root - in serverless, env is already injected by platform
if (process.env.NETLIFY !== 'true') {
  dotenv.config({ path: path.join(__dirname, '../.env') });
}

const app: express.Application = express();

// Security middleware
app.use(helmet());

const apiBasePaths = ['/api', '/.netlify/functions/api'] as const;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 10000, // Very lenient in development
  message: 'Too many requests from this IP, please try again later.',
  skip: (_req) => {
    // Skip rate limiting for development environment
    return process.env.NODE_ENV !== 'production';
  }
});
for (const basePath of apiBasePaths) {
  const limiterPath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  app.use(limiterPath, limiter);
}

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? true  // Allow same origin in production (works with blank VITE_API_URL)
    : [
        'http://localhost:3000', 
        'http://localhost:5173', 
        'http://localhost:5174',
        'http://localhost:8888',      // Netlify Dev
        'http://127.0.0.1:8888',      // Netlify Dev (IPv4)
        'http://127.0.0.1:5173',      // Vite (IPv4)
        'http://127.0.0.1:5174',      // Vite alt port (IPv4)
      ], // Development origins
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lightweight request logging to help debug serverless deployments
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestIdHeader = req.headers['x-nf-request-id'] ?? req.headers['x-request-id'];
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
  console.info('[api][request]', {
    method: req.method,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    host: req.headers.host,
    requestId,
  });
  next();
});

// Request timeout middleware for uploads
const extendUploadTimeout = (req: Request, res: Response, next: NextFunction): void => {
  // Set longer timeout for upload requests (5 minutes)
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
};

for (const basePath of apiBasePaths) {
  app.use(path.posix.join(basePath, 'upload'), extendUploadTimeout);
  app.use(basePath, apiRoutes);
}

/**
 * health
 */
const basicHealthHandler = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
    service: 'Interactive English Tutor API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
};

for (const basePath of apiBasePaths) {
  app.use(path.posix.join(basePath, 'health'), basicHealthHandler);
}

// Detailed health checks (env + Supabase connectivity)
const detailedHealthHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = await runAllChecks();
    res.status(results.ok ? 200 : 500).json({ success: results.ok, ...results });
  } catch (e: unknown) {
    const error = e as { message?: string } | undefined;
    res.status(500).json({ success: false, error: error?.message || 'Health checks failed' });
  }
};

for (const basePath of apiBasePaths) {
  app.get(path.posix.join(basePath, 'health', 'checks'), detailedHealthHandler);
}

// API documentation endpoint
const docsHandler = (_req: Request, res: Response): void => {
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
};

for (const basePath of apiBasePaths) {
  app.get(basePath, docsHandler);
}

/**
 * error handler middleware
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
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
  console.warn('[api][404]', {
    method: req.method,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
  });
  res.status(404).json({
    success: false,
    error: 'API not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: '/api'
  });
});

export default app;
