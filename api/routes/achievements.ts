/**
 * Achievements API Routes
 * Handles achievement management and user achievement tracking
 */
import express from 'express';
import Joi from 'joi';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requireRole } from '../utils/jwt';
import type { Achievement, UserAchievement } from '../config/supabase.js';

const router = express.Router();

// Validation schemas
const awardAchievementSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  achievementId: Joi.string().uuid().required()
});

/**
 * GET /api/achievements
 * Get all available achievements
 */
router.get('/', async (req, res) => {
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

/**
 * GET /api/achievements/user/:userId
 * Get user's achievements with progress
 * Requires authentication and proper access (user themselves, parent, or admin)
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    // Check access permissions
    if (currentUser.role === 'child' && currentUser.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (currentUser.role === 'parent') {
      // Check if this is their child
      const { data: child, error: childError } = await supabase
        .from('users')
        .select('parent_id')
        .eq('id', userId)
        .single();

      if (childError || !child || child.parent_id !== currentUser.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get all achievements with user's progress
    const { data: achievements, error: achievementsError } = await supabase
      .from('achievements')
      .select(`
        *,
        user_achievements!left(
          id,
          earned_at,
          user_id
        )
      `)
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

/**
 * POST /api/achievements/award
 * Award an achievement to a user
 * Requires admin role
 */
router.post('/award', authenticateToken, requireRole(['admin']), async (req, res) => {
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
      message: `Achievement "${achievement.title}" awarded to ${user.username}`,
      userAchievement,
      achievement
    });
  } catch (error) {
    console.error('Error in POST /achievements/award:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/achievements/revoke
 * Revoke an achievement from a user
 * Requires admin role
 */
router.delete('/revoke', authenticateToken, requireRole(['admin']), async (req, res) => {
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

/**
 * GET /api/achievements/leaderboard
 * Get achievement leaderboard (top users by points)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // Get users with their total achievement points
    const { data: leaderboard, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        avatar_url,
        user_achievements!inner(
          achievements!inner(
            points
          )
        )
      `)
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

export default router;