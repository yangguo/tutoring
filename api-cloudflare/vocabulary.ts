import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';

type VocabularyBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
  };
};

const vocabulary = new Hono<VocabularyBindings>();

vocabulary.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('vocabulary_words').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ words: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load vocabulary';
    return c.json({ error: message }, 500);
  }
});

export default vocabulary;
