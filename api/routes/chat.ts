/**
 * Chat Routes
 * Handles AI chat functionality for lessons and books
 */
import express from 'express';
import lessonChatHandler from '../chat/lesson.js';

const router = express.Router();

/**
 * POST /api/chat/lesson
 * Handle lesson-based AI chat with book and lesson context
 */
router.post('/lesson', lessonChatHandler);

export default router;