import { Hono } from 'hono';
import { supabase } from './config/supabase';

const library = new Hono();

library.get('/', async (c) => {
  const { data, error } = await supabase.from('books').select('*');
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ books: data });
});

export default library;
