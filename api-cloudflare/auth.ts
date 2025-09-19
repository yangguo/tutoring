import { Hono } from 'hono';
import { supabase } from './config/supabase';
import { signToken } from './utils/jwt';

const auth = new Hono();

// Login route
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return c.json({ error: error.message }, 401);
  const token = await signToken({ user: data.user });
  return c.json({ token, user: data.user });
});

// Register route
auth.post('/register', async (c) => {
  const { email, password } = await c.req.json();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return c.json({ error: error.message }, 400);
  const token = await signToken({ user: data.user });
  return c.json({ token, user: data.user });
});

export default auth;
