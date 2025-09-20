import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';

const library = new Hono();

library.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('books').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ books: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load library';
    return c.json({ error: message }, 500);
  }
});

export default library;
