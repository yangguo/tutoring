"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Interactive English Tutor Express.js Application
 * Main application setup with routes and middleware
 */
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
const router_js_1 = __importDefault(require("./router.js"));
const health_js_1 = require("./utils/health.js");
// for esm mode
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
// load env from project root
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)());
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 10000, // Very lenient in development
    message: 'Too many requests from this IP, please try again later.',
    skip: (_req) => {
        // Skip rate limiting for development environment
        return process.env.NODE_ENV !== 'production';
    }
});
app.use('/api/', limiter);
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? true // Allow same origin in production (works with blank VITE_API_URL)
        : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'], // Development origins
    credentials: true
}));
// Body parsing middleware
// Body parsing middleware
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Request timeout middleware for uploads
app.use('/api/upload', (req, res, next) => {
    // Set longer timeout for upload requests (5 minutes)
    req.setTimeout(300000);
    res.setTimeout(300000);
    next();
});
// Request timeout middleware for uploads
app.use('/api/upload', (req, res, next) => {
    // Set longer timeout for upload requests (5 minutes)
    req.setTimeout(300000);
    res.setTimeout(300000);
    next();
});
// API Routes
app.use('/api', router_js_1.default);
/**
 * health
 */
app.use('/api/health', (_req, res, _next) => {
    res.status(200).json({
        success: true,
        message: 'ok',
        service: 'Interactive English Tutor API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});
// Detailed health checks (env + Supabase connectivity)
app.get('/api/health/checks', async (_req, res) => {
    try {
        const results = await (0, health_js_1.runAllChecks)();
        res.status(results.ok ? 200 : 500).json({ success: results.ok, ...results });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e?.message || 'Health checks failed' });
    }
});
// API documentation endpoint
app.get('/api', (_req, res) => {
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
app.use((error, _req, res, _next) => {
    console.error('Global error handler:', error);
    // Multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
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
    res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Server internal error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});
/**
 * 404 handler
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'API not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        availableEndpoints: '/api'
    });
});
exports.default = app;
//# sourceMappingURL=app.js.map