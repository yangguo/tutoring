import type { Context } from 'hono';

// Error handling utility
export function handleError(c: Context, error: Error | unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  // Optionally log error here
  return c.json({ error: message }, status);
}
