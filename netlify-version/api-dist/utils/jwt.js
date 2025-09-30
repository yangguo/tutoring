"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessChildData = exports.requireRole = exports.authenticateToken = exports.extractTokenFromHeader = exports.verifyToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Use string format for jsonwebtoken
/**
 * Generate a JWT token for a user
 */
const generateToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
    };
    // @ts-ignore - JWT accepts string format like '7d', '24h' etc.
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
exports.generateToken = generateToken;
/**
 * Verify and decode a JWT token
 */
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch (error) {
        throw new Error('Invalid or expired token');
    }
};
exports.verifyToken = verifyToken;
/**
 * Extract token from Authorization header
 */
const extractTokenFromHeader = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
};
exports.extractTokenFromHeader = extractTokenFromHeader;
/**
 * Middleware to verify JWT token
 */
const authenticateToken = (req, res, next) => {
    const token = (0, exports.extractTokenFromHeader)(req.headers.authorization);
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    try {
        const decoded = (0, exports.verifyToken)(token);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};
exports.authenticateToken = authenticateToken;
/**
 * Middleware to check if user has required role
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Middleware to check if user can access child data (parent or the child themselves)
 */
const canAccessChildData = async (req, res, next) => {
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
exports.canAccessChildData = canAccessChildData;
//# sourceMappingURL=jwt.js.map