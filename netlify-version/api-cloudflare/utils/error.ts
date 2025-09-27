// Error handling utility
export function handleError(c: any, error: any, status = 500) {
  // Optionally log error here
  return c.json({ error: error.message || 'Internal server error' }, status);
}
