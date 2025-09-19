import { Hono } from 'hono';
import { supabase } from './config/supabase';

const vocabulary = new Hono();

vocabulary.get('/', async (c) => {
  const { data, error } = await supabase.from('vocabulary_words').select('*');
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ words: data });
});

export default vocabulary;
