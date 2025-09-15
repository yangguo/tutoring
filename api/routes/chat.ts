/**
 * Chat Routes
 * Handles AI chat functionality for lessons and books
 */
import express from 'express';
import lessonChatHandler from '../chat/lesson.ts';
import speakingPracticeChatHandler from '../chat/speaking-practice.ts';

const router = express.Router();

/**
 * POST /api/chat/lesson
 * Handle lesson-based AI chat with book and lesson context
 */
router.post('/lesson', lessonChatHandler);

/**
 * POST /api/chat/speaking-practice
 * Handle speaking practice AI chat with current page context
 */
router.post('/speaking-practice', speakingPracticeChatHandler);

export default router;