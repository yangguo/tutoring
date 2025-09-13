import { Router, Request, Response } from 'express';
import { authenticateToken } from '../utils/jwt';
import { supabase } from '../config/supabase';

const router = Router();

// Apply authentication middleware to all dashboard routes
router.use(authenticateToken);

// GET /api/dashboard/students - Fetch student data with progress
router.get('/students', async (req: Request, res: Response) => {
  try {
    const { data: students, error } = await supabase
      .from('users')
      .select(`
        id,
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
        )
      `)
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

// GET /api/dashboard/lessons - Fetch lesson plans (for parents/admins)
router.get('/lessons', async (req: Request, res: Response) => {
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

// GET /api/dashboard/my-lessons - Fetch assigned lessons for students
router.get('/my-lessons', async (req: Request, res: Response) => {
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
        let books = [];
        
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

// POST /api/dashboard/lessons - Create lesson plan
router.post('/lessons', async (req: Request, res: Response) => {
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

// PUT /api/dashboard/lessons/:id - Update lesson plan
router.put('/lessons/:id', async (req: Request, res: Response) => {
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

// DELETE /api/dashboard/lessons/:id - Delete lesson plan
router.delete('/lessons/:id', async (req: Request, res: Response) => {
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

// GET /api/dashboard/progress - Fetch user progress data
router.get('/progress', async (req: Request, res: Response) => {
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

// GET /api/dashboard/analytics - Fetch analytics data
router.get('/analytics', async (req: Request, res: Response) => {
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

export default router;
