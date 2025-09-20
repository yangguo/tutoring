import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { signToken } from './utils/jwt';

const auth = new Hono();

// Login route
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return c.json({ error: error.message }, 401);
    const secret = c.env.JWT_SECRET;
    if (!secret) return c.json({ error: 'Authentication is not configured' }, 500);
    const token = await signToken({ user: data.user }, secret);
    return c.json({ token, user: data.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: message }, 500);
  }
});

// Register route
auth.post('/register', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return c.json({ error: error.message }, 400);
    const secret = c.env.JWT_SECRET;
    if (!secret) return c.json({ error: 'Authentication is not configured' }, 500);
    const token = await signToken({ user: data.user }, secret);
    return c.json({ token, user: data.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: message }, 500);
  }
});

export default auth;
