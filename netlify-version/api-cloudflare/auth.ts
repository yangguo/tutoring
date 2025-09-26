import { Hono } from 'hono';
import type { Context } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { signToken, jwtMiddleware, type SessionPayload } from './utils/jwt';

type AuthBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
  };
};

const auth = new Hono<AuthBindings>();

const formatProfileResponse = (profile: any) => ({
  id: profile.id,
  email: profile.email,
  username: profile.username ?? profile.full_name ?? profile.email,
  role: profile.role,
  age: profile.age ?? null,
  grade_level: profile.grade_level ?? null,
  parent_id: profile.parent_id ?? null,
  avatar_url: profile.avatar_url ?? null,
  created_at: profile.created_at,
});

const buildSessionPayload = (profile: { id: string; email: string; role: string }): SessionPayload => ({
  userId: profile.id,
  email: profile.email,
  role: profile.role,
});

const fetchUserProfile = async (supabase: ReturnType<typeof createSupabaseClient>, userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
};

// Login
auth.post('/login', async (c) => {
  try {
    const { email, password }: { email: string; password: string } = await c.req.json();
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return c.json({ error: error?.message ?? 'Invalid credentials' }, 401);
    }

    const profile = await fetchUserProfile(supabase, data.user.id);
    if (!profile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'Authentication is not configured' }, 500);
    }

    const sessionPayload = buildSessionPayload({ id: profile.id, email: profile.email, role: profile.role });
    const token = await signToken(sessionPayload, secret);

    return c.json({ token, user: formatProfileResponse(profile) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return c.json({ error: message }, 500);
  }
});

// Register
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const {
      email,
      password,
      username,
      role,
      age,
      grade_level,
      parent_id,
      parent_email,
    }: {
      email: string;
      password: string;
      username?: string;
      role: string;
      age?: number;
      grade_level?: string;
      parent_id?: string;
      parent_email?: string;
    } = body;

    if (!email || !password || !role) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Prevent duplicate email
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    if (existingUser) {
      return c.json({ error: 'User already exists with this email' }, 409);
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      return c.json({ error: error?.message ?? 'Unable to register user' }, 400);
    }

    let resolvedParentId = parent_id ?? null;
    if (!resolvedParentId && role === 'child' && parent_email) {
      const { data: parentProfile } = await supabase
        .from('users')
        .select('id')
        .eq('email', parent_email)
        .eq('role', 'parent')
        .single();
      resolvedParentId = parentProfile?.id ?? null;
    }

    const profilePayload = {
      id: data.user.id,
      email,
      username: username ?? null,
      full_name: username ?? null,
      role,
      age: role === 'child' ? age ?? null : null,
      grade_level: role === 'child' ? grade_level ?? null : null,
      parent_id: resolvedParentId,
      created_at: new Date().toISOString(),
    };

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert(profilePayload)
      .select('*')
      .single();

    if (profileError || !profile) {
      await supabase.auth.admin.deleteUser(data.user.id);
      return c.json({ error: 'Failed to create user profile' }, 500);
    }

    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'Authentication is not configured' }, 500);
    }

    const sessionPayload = buildSessionPayload({ id: profile.id, email: profile.email, role: profile.role });
    const token = await signToken(sessionPayload, secret);

    return c.json({ token, user: formatProfileResponse(profile) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return c.json({ error: message }, 500);
  }
});

auth.use('/me', jwtMiddleware);
auth.use('/logout', jwtMiddleware);

auth.get('/me', async (c: Context<{ Bindings: AuthBindings['Bindings']; Variables: { user: SessionPayload } }>) => {
  try {
    const session = c.var.user;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createSupabaseClient(c.env);
    const profile = await fetchUserProfile(supabase, session.userId);
    if (!profile) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: formatProfileResponse(profile) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch profile';
    return c.json({ error: message }, 500);
  }
});

auth.post('/logout', async (c) => {
  return c.json({ message: 'Logout successful' });
});

export default auth;
