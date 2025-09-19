import { Hono } from 'hono';
import { handleError } from './utils/error';

const upload = new Hono();

upload.post('/', async (c: any) => {
  try {
    // Example: handle file upload to R2 or Supabase Storage
    // const file = await c.req.parseBody();
    // Upload logic here
    return c.json({ message: 'File uploaded (stub)' });
  } catch (error) {
    return handleError(c, error);
  }
});

export default upload;
