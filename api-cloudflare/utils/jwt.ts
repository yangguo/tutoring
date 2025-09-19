
import { verify, sign } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function verifyToken(token: string): Promise<any> {
  try {
    return await verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

export async function signToken(payload: object) {
  return await sign(payload, JWT_SECRET);
}

// Hono middleware for JWT authentication
export const jwtMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  c.set('user', payload.user || payload);
  await next();
// End of jwtMiddleware
};
