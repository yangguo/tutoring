import { Hono } from 'hono';
import { createChatCompletion } from '../lib/openai';
import { handleError } from '../utils/error';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface BookContext {
  title: string;
  author: string;
  description: string;
  difficulty_level: string;
  age_range: string;
  page_count: number;
}

interface PageContext {
  number: number;
  text_content?: string;
  image_description?: string;
  image_url?: string;
}

interface SpeakingPracticeRequestBody {
  message: string;
  history?: ChatMessage[];
  context: {
    book: BookContext;
    currentPage: PageContext;
    practiceMode?: string;
  };
}

type SpeakingPracticeBindings = {
  Bindings: {
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_MODEL?: string;
  };
};

const speakingPractice = new Hono<SpeakingPracticeBindings>();

const buildSystemPrompt = (context: SpeakingPracticeRequestBody['context']) => {
  const pageContent =
    context.currentPage.text_content || context.currentPage.image_description || 'No content available';

  return `You are an AI English tutor helping a student with speaking practice.

CONTEXT:
- Book: "${context.book.title}" by ${context.book.author}
- Current Page: ${context.currentPage.number}
- Student Level: ${context.book.difficulty_level}
- Target Age: ${context.book.age_range} years
- Page Content: ${pageContent}

Your role:
1. Have natural conversations about the book content on this specific page
2. Ask engaging questions about what they see or read on this page
3. Provide vocabulary help when needed
4. Give positive, encouraging feedback
5. Keep responses concise and conversational
6. Focus on building speaking confidence

IMPORTANT: Keep responses short (2-3 sentences max). Reference the specific page content when asking questions. Encourage the student to describe what they see, read, or think about this page.`;
};

speakingPractice.post('/', async (c) => {
  try {
    const body = (await c.req.json()) as SpeakingPracticeRequestBody;
    const { message, history = [], context } = body;

    if (!message || !context?.book || !context?.currentPage) {
      return c.json(
        { error: 'Missing required fields: message, context.book, and context.currentPage are required' },
        400,
      );
    }

    const apiKey = c.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleError(c, new Error('Missing OpenAI API key'), 500);
    }

    const systemPrompt = buildSystemPrompt(context);

    const completion = await createChatCompletion({
      apiKey,
      baseUrl: c.env.OPENAI_BASE_URL,
      model: c.env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      maxTokens: 500,
    });

    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) {
      throw new Error('No content received from OpenAI');
    }

    return c.json({ success: true, response: responseText, timestamp: new Date().toISOString() });
  } catch (error) {
    return handleError(c, error);
  }
});

export default speakingPractice;
