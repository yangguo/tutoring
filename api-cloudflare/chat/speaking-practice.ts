import { Hono } from 'hono';
import { chatWithOpenAI } from '../lib/openai';
import { handleError } from '../utils/error';

type SpeakingPracticeBindings = {
  Bindings: {
    OPENAI_API_KEY: string;
  };
};

const speakingPractice = new Hono<SpeakingPracticeBindings>();

speakingPractice.post('/', async (c) => {
  try {
    const { messages } = await c.req.json();
    const apiKey = c.env.OPENAI_API_KEY;
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
