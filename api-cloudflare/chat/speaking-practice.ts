import { Hono } from 'hono';
import { chatWithOpenAI } from '../lib/openai';
import { handleError } from '../utils/error';

const speakingPractice = new Hono();

speakingPractice.post('/', async (c: any) => {
  try {
    const { messages } = await c.req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleError(c, new Error('Missing OpenAI API key'), 500);
    }
    const result = await chatWithOpenAI(messages, apiKey);
    return c.json({ result });
  } catch (error) {
    return handleError(c, error);
  }
});

export default speakingPractice;
