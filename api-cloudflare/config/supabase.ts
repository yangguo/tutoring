import { createClient } from '@supabase/supabase-js';

type EnvWithSupabase = {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
};

export function createSupabaseClient(env: EnvWithSupabase) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials are not configured');
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
