import type { Context, Next } from 'hono';
import { verify, sign } from 'hono/jwt';

type EnvWithJwt = {
  JWT_SECRET?: string;
};

export async function verifyToken(token: string, secret: string): Promise<any> {
  try {
    return await verify(token, secret);
  } catch (e) {
    return null;
  }
}

export async function signToken(payload: object, secret: string) {
  return await sign(payload, secret);
}

export const jwtMiddleware = async (c: Context<{ Bindings: EnvWithJwt }>, next: Next) => {
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Authentication is not configured' }, 500);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const payload = await verifyToken(token, secret);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', payload.user || payload);
  await next();
};
