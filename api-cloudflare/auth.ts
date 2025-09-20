import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { signToken, type SessionPayload } from './utils/jwt';
import type { User } from '@supabase/supabase-js';

type AuthBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
  };
};

const auth = new Hono<AuthBindings>();

const buildSessionPayload = (user: User): SessionPayload => {
  const roleFromMetadata = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : undefined;
  return {
    userId: user.id,
    email: user.email ?? '',
    role: roleFromMetadata ?? user.role ?? 'child'
  };
};

// Login route
auth.post('/login', async (c) => {
  try {
    const { email, password }: { email: string; password: string } = await c.req.json();
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return c.json({ error: error?.message ?? 'Invalid credentials' }, 401);
    const secret = c.env.JWT_SECRET;
    if (!secret) return c.json({ error: 'Authentication is not configured' }, 500);
    const payload = buildSessionPayload(data.user);
    const token = await signToken(payload, secret);
    return c.json({ token, user: data.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: message }, 500);
  }
});

// Register route
auth.post('/register', async (c) => {
  try {
    const { email, password }: { email: string; password: string } = await c.req.json();
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) return c.json({ error: error?.message ?? 'Unable to register user' }, 400);
    const secret = c.env.JWT_SECRET;
    if (!secret) return c.json({ error: 'Authentication is not configured' }, 500);
    const payload = buildSessionPayload(data.user);
    const token = await signToken(payload, secret);
    return c.json({ token, user: data.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: message }, 500);
  }
});

export default auth;
