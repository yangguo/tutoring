import { Hono } from 'hono';
import { cors } from 'hono/cors';
import auth from './auth';
import library from './library';
import lessons from './lessons';
import readingSession from './reading-session';
import achievements from './achievements';
import vocabulary from './vocabulary';
import upload from './upload';
import lesson from './chat/lesson';
import speakingPractice from './chat/speaking-practice';
import books from './books';
import pages from './pages';
import { jwtMiddleware } from './utils/jwt';
import dashboard from './dashboard';
import { createSupabaseClient } from './config/supabase';

type RouterBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
    OPENAI_API_KEY: string;
  };
};

const app = new Hono<RouterBindings>();

app.use('*', cors({
  origin: (origin) => origin ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Type'],
  maxAge: 86400
}));

app.get('/api/health', (c) => c.json({ status: 'ok', cloudflare: true }));

// Enhanced health check with database connectivity test
app.get('/api/health/detailed', async (c) => {
  const health = {
    status: 'ok',
    cloudflare: true,
    timestamp: new Date().toISOString(),
    supabase: {
      status: 'unknown' as 'unknown' | 'connected' | 'error',
      error: null as string | null
    },
    env: {
      hasSupabaseUrl: !!c.env.SUPABASE_URL,
      hasSupabaseKey: !!c.env.SUPABASE_KEY,
      hasJwtSecret: !!c.env.JWT_SECRET,
      hasOpenaiKey: !!c.env.OPENAI_API_KEY
    }
  };

  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase
      .from('books')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      health.supabase.status = 'error';
      health.supabase.error = error.message;
    } else {
      health.supabase.status = 'connected';
    }
  } catch (dbError) {
    health.supabase.status = 'error';
    health.supabase.error = dbError instanceof Error ? dbError.message : String(dbError);
  }

  const statusCode = health.supabase.status === 'error' ? 503 : 200;
  return c.json(health, statusCode);
});

app.route('/api/auth', auth);

// Protected routes
app.use('/api/library/*', jwtMiddleware);
app.use('/api/lessons/*', jwtMiddleware);
app.use('/api/reading-session/*', jwtMiddleware);
app.use('/api/achievements/*', jwtMiddleware);
app.use('/api/vocabulary/*', jwtMiddleware);
app.use('/api/upload/*', jwtMiddleware);
app.use('/api/chat/lesson/*', jwtMiddleware);
app.use('/api/chat/speaking-practice/*', jwtMiddleware);
app.use('/api/books/*', jwtMiddleware);
app.use('/api/dashboard/*', jwtMiddleware);

app.route('/api/library', library);
app.route('/api/lessons', lessons);
app.route('/api/reading-session', readingSession);
app.route('/api/achievements', achievements);
app.route('/api/vocabulary', vocabulary);
app.route('/api/upload', upload);
app.route('/api/upload/book', pages);
app.route('/api/chat/lesson', lesson);
app.route('/api/chat/speaking-practice', speakingPractice);
app.route('/api/books', books);
app.route('/api/dashboard', dashboard);

export default app;
