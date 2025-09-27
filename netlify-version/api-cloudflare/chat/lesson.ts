import { Hono } from 'hono';
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
  target_age: string;
  page_count: number;
}

interface LessonContext {
  title: string;
  description: string;
  objectives: string[];
  activities: any[];
  target_level: string;
  duration: number;
}

interface PageContext {
  number: number;
  text?: string;
  description?: string;
  image_url?: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  context: {
    book: BookContext;
    lesson: LessonContext;
    currentPage?: PageContext;
  };
}

const lesson = new Hono();

const generateLessonResponse = (message: string, history: ChatMessage[] = [], context: ChatRequestBody['context']) => {
  const lowerMessage = message.toLowerCase();
  const { book, lesson, currentPage } = context;

  const formatObjectives = (items: string[]) => items.map((obj, idx) => `${idx + 1}. ${obj}`).join('\n');
  const formatActivities = (items: any[]) =>
    items
      .map((activity, idx) => `${idx + 1}. ${typeof activity === 'string' ? activity : activity.description || activity.type || 'Activity'}`)
      .join('\n');

  const pageContext = currentPage
    ? `\n\nOn page ${currentPage.number}, we're looking at: "${currentPage.text || currentPage.description || 'this part of the story'}"`
    : '';

  if (lowerMessage.includes('objective') || lowerMessage.includes('goal')) {
    return `Great question! Let's review our lesson objectives for "${lesson.title}":\n\n${formatObjectives(lesson.objectives)}\n\nWhich objective would you like to explore using "${book.title}"?`;
  }

  if (lowerMessage.includes('activity') || lowerMessage.includes('activities')) {
    return `Here are the activities planned for this lesson:\n\n${formatActivities(lesson.activities)}\n\nWhich one sounds good to try next?`;
  }

  if (lowerMessage.includes('book') || lowerMessage.includes(book.title.toLowerCase())) {
    return `"${book.title}" by ${book.author} is a wonderful ${book.difficulty_level}-level book that supports our lesson "${lesson.title}". What part of the story should we explore to reach our objectives?`;
  }

  if (lowerMessage.includes('character') || lowerMessage.includes('who')) {
    return `Let's think about the characters in "${book.title}".${pageContext}\n\nWhat do you notice about the characters here, and how does that connect to our lesson goals?`;
  }

  if (lowerMessage.includes('theme') || lowerMessage.includes('lesson') || lowerMessage.includes('meaning')) {
    return `Themes help us understand why our lesson matters. Based on "${book.title}"${pageContext}, what themes do you notice that connect to our objectives ${lesson.objectives
      .slice(0, 2)
      .map((obj) => `• ${obj}`)
      .join('\n')}\n\nWhat theme stands out to you?`;
  }

  if (lowerMessage.includes('page') || lowerMessage.includes('image') || lowerMessage.includes('picture')) {
    if (currentPage) {
      return `Page ${currentPage.number} gives us a lot to explore.${pageContext}\n\nWhat details stand out to you here? How do they connect with what we've already read?`;
    }
  }

  if (lowerMessage.includes('help') || lowerMessage.includes('explain')) {
    return `I'm happy to help! We can look at the story, discuss the lesson objectives, review the activities, or break down any tricky parts. Where should we start?`;
  }

  if (lowerMessage.includes('next') || lowerMessage.includes('what now')) {
    return `We're making great progress with "${lesson.title}". Next, we could:\n\n• Dive deeper into an objective\n• Try an activity\n• Explore another part of "${book.title}"\n\nWhat would you like to do?`;
  }

  if (lowerMessage.includes('summary') || lowerMessage.includes('progress')) {
    return `Let's review! We're using "${book.title}" to reach our lesson goals:${pageContext}\n\nObjectives:\n${formatObjectives(lesson.objectives)}\n\nWhat have you learned so far?`;
  }

  const previousAssistantMessage = history
    .slice()
    .reverse()
    .find((msg) => msg.role === 'assistant');

  if (previousAssistantMessage && previousAssistantMessage.content === message) {
    return `Let's look at this from another angle. Thinking about "${book.title}" and our lesson "${lesson.title}", what new detail can we explore?`;
  }

  return `That's a thoughtful point! ${pageContext}\n\nHow does this connect to our lesson "${lesson.title}"? Would you like guidance through one of the lesson activities or to focus on a specific part of "${book.title}"?`;
};

lesson.post('/', async (c) => {
  try {
    const body = (await c.req.json()) as ChatRequestBody;
    const { message, history = [], context } = body;

    if (!message || !context?.book || !context?.lesson) {
      return c.json(
        { error: 'Missing required fields: message, context.book, and context.lesson are required' },
        400,
      );
    }

    const response = generateLessonResponse(message, history, context);

    return c.json({
      response,
      context: {
        lesson_title: context.lesson.title,
        book_title: context.book.title,
      },
    });
  } catch (error) {
    return handleError(c, error);
  }
});

export default lesson;
