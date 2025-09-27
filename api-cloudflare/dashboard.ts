import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import type { SessionPayload } from './utils/jwt';

type DashboardBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

const dashboard = new Hono<DashboardBindings>();

function buildLessonResponse(lesson: any) {
  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    targetLevel: lesson.target_level,
    duration: lesson.duration,
    objectives: lesson.objectives || [],
    activities: lesson.activities || [],
    assignedStudents: lesson.assigned_students || [],
    bookIds: lesson.book_ids || [],
    books: lesson.books || [],
    createdAt: lesson.created_at,
  };
}

dashboard.get('/students', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data: students, error } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        created_at,
        reading_sessions (
          duration,
          comprehension_score,
          created_at
        ),
        speaking_sessions (
          pronunciation_score,
          fluency_score,
          accuracy_score,
          created_at
        ),
        user_vocabulary (
          id
        )
      `)
      .eq('role', 'child');

    if (error) {
      return c.json({ error: 'Failed to fetch students' }, 500);
    }

    const transformed = (students || []).map((student) => {
      const readingSessions = student.reading_sessions || [];
      const speakingSessions = student.speaking_sessions || [];
      const vocabulary = student.user_vocabulary || [];

      const totalReadingTime = readingSessions.reduce((sum: number, session: any) => sum + (session.duration || 0), 0);
      const booksCompleted = readingSessions.length;
      const vocabularyLearned = vocabulary.length;

      const avgComprehension = readingSessions.length
        ? readingSessions.reduce((sum: number, session: any) => sum + (session.comprehension_score || 0), 0) /
          readingSessions.length
        : 0;

      const avgSpeaking = speakingSessions.length
        ? speakingSessions.reduce((sum: number, session: any) => {
            const sessionAverage =
              ((session.pronunciation_score || 0) + (session.fluency_score || 0) + (session.accuracy_score || 0)) / 3;
            return sum + sessionAverage;
          }, 0) / speakingSessions.length
        : 0;

      const averageScore = Math.round((avgComprehension + avgSpeaking) / 2);

      let level = 'Beginner';
      if (averageScore >= 80) level = 'Advanced';
      else if (averageScore >= 60) level = 'Intermediate';

      const lastSession = [...readingSessions, ...speakingSessions]
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      const lastActive = lastSession
        ? new Date(lastSession.created_at).toLocaleDateString()
        : new Date(student.created_at).toLocaleDateString();

      return {
        id: student.id,
        name: student.full_name,
        email: student.email,
        age: 8,
        level,
        totalReadingTime,
        booksCompleted,
        vocabularyLearned,
        lastActive,
        averageScore,
      };
    });

    return c.json(transformed);
  } catch (error) {
    console.error('Error fetching dashboard students', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.get('/lessons', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data: lessons, error } = await supabase
      .from('lesson_plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: 'Failed to fetch lessons' }, 500);
    }

    return c.json((lessons || []).map(buildLessonResponse));
  } catch (error) {
    console.error('Error fetching dashboard lessons', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.get('/my-lessons', async (c) => {
  try {
    const userId = c.var.user?.userId;
    if (!userId) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    const supabase = createSupabaseClient(c.env);
    const { data: lessons, error } = await supabase
      .from('lesson_plans')
      .select('*')
      .contains('assigned_students', [userId])
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: 'Failed to fetch assigned lessons' }, 500);
    }

    const enriched = await Promise.all(
      (lessons || []).map(async (lesson) => {
        if (lesson.book_ids && lesson.book_ids.length > 0) {
          const { data: books, error: booksError } = await supabase
            .from('books')
            .select('id, title, author, cover_image_url')
            .in('id', lesson.book_ids);

          if (!booksError) {
            lesson.books = books || [];
          }
        }

        return buildLessonResponse(lesson);
      })
    );

    return c.json(enriched);
  } catch (error) {
    console.error('Error fetching my lessons', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.post('/lessons', async (c) => {
  try {
    const body = await c.req.json();
    const { title, description, targetLevel, duration, objectives, activities, assignedStudents, bookIds } = body;

    if (!title || !description || !targetLevel || !duration) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const supabase = createSupabaseClient(c.env);
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
        created_by: c.var.user?.userId,
      })
      .select()
      .single();

    if (error || !lesson) {
      return c.json({ error: 'Failed to create lesson' }, 500);
    }

    return c.json(buildLessonResponse(lesson), 201);
  } catch (error) {
    console.error('Error creating lesson', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.put('/lessons/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const payload = await c.req.json();

    const updateData: Record<string, any> = {};
    if (payload.title !== undefined) updateData.title = payload.title;
    if (payload.description !== undefined) updateData.description = payload.description;
    if (payload.targetLevel !== undefined) updateData.target_level = payload.targetLevel;
    if (payload.duration !== undefined) updateData.duration = payload.duration;
    if (payload.objectives !== undefined) updateData.objectives = payload.objectives;
    if (payload.activities !== undefined) updateData.activities = payload.activities;
    if (payload.assignedStudents !== undefined) updateData.assigned_students = payload.assignedStudents;
    if (payload.bookIds !== undefined) updateData.book_ids = payload.bookIds;

    const supabase = createSupabaseClient(c.env);
    const { data: lesson, error } = await supabase
      .from('lesson_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return c.json({ error: 'Failed to update lesson' }, 500);
    }

    if (!lesson) {
      return c.json({ error: 'Lesson not found' }, 404);
    }

    return c.json(buildLessonResponse(lesson));
  } catch (error) {
    console.error('Error updating lesson', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.delete('/lessons/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const supabase = createSupabaseClient(c.env);
    const { error } = await supabase.from('lesson_plans').delete().eq('id', id);

    if (error) {
      return c.json({ error: 'Failed to delete lesson' }, 500);
    }

    return c.body(null, 204);
  } catch (error) {
    console.error('Error deleting lesson', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

dashboard.get('/progress', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);

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

    const { count: vocabularyCount, error: vocabError } = await supabase
      .from('user_vocabulary')
      .select('id', { count: 'exact', head: true });

    if (readingError || speakingError || vocabError) {
      return c.json({ error: 'Failed to fetch progress data' }, 500);
    }

    return c.json({
      recentReadingSessions: readingSessions || [],
      recentSpeakingSessions: speakingSessions || [],
      totalVocabularyLearned: vocabularyCount || 0,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching dashboard progress', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default dashboard;
