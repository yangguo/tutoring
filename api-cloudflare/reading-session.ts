import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';

type ReadingSessionBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
  };
};

const readingSession = new Hono<ReadingSessionBindings>();

readingSession.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('reading_sessions').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ sessions: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reading sessions';
    return c.json({ error: message }, 500);
  }
});

export default readingSession;
