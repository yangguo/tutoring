import { Request, Response } from 'express';
import { authenticateToken } from '../utils/jwt';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  image_url: string;
}

interface SpeakingPracticeChatRequest {
  message: string;
  history: ChatMessage[];
  context: {
    book: BookContext;
    currentPage: PageContext;
    practiceMode?: string;
  };
}

// AI response function for speaking practice context
const generateSpeakingPracticeResponse = async (
  message: string, 
  history: ChatMessage[], 
  context: { book: BookContext; currentPage: PageContext; practiceMode?: string }
): Promise<string> => {
  // Check if OpenAI configuration is available
  if (!process.env.OPENAI_BASE_URL || 
      !process.env.OPENAI_API_KEY || 
      process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
      process.env.OPENAI_API_KEY.length < 10) {
    return generateMockResponse(message, context);
  }

  try {
    // Create system prompt for speaking practice
    const systemPrompt = `You are an AI English tutor helping a student with speaking practice. Here's the context:

BOOK INFORMATION:
- Title: "${context.book.title}" by ${context.book.author}
- Description: ${context.book.description}
- Difficulty Level: ${context.book.difficulty_level}
- Target Age: ${context.book.age_range} years
- Total Pages: ${context.book.page_count}

CURRENT PAGE CONTEXT:
- Page Number: ${context.currentPage.number}
- Text Content: ${context.currentPage.text_content || 'No text available'}
- Image Description: ${context.currentPage.image_description || 'No description available'}

Your role is to:
1. Help students practice speaking and pronunciation
2. Encourage discussion about the current page content
3. Ask engaging questions about the story, characters, and themes
4. Provide vocabulary support and explanations
5. Give positive feedback and encouragement
6. Adapt responses to the student's age and reading level
7. Use the current page context to create relevant speaking practice opportunities

Be encouraging, patient, and educational. Focus on building confidence in speaking English.`;

    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo',
        messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      return generateMockResponse(message, context);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generateMockResponse(message, context);

  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return generateMockResponse(message, context);
  }
};

// Fallback mock response function
const generateMockResponse = (message: string, context: { book: BookContext; currentPage: PageContext; practiceMode?: string }): string => {
  const lowerMessage = message.toLowerCase();
  const { book, currentPage } = context;
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return `Hello! I'm excited to help you practice speaking English with "${book.title}"! We're on page ${currentPage.number}. What would you like to talk about from this page?`;
  }
  
  if (lowerMessage.includes('character') || lowerMessage.includes('who')) {
    return `Great question about the characters! Looking at page ${currentPage.number}, let's practice speaking about the characters we see. ${currentPage.text_content ? `The text says: "${currentPage.text_content.substring(0, 100)}..."` : ''} Can you tell me what you think about the main character? Try to speak your thoughts out loud!`;
  }
  
  if (lowerMessage.includes('what happen') || lowerMessage.includes('story')) {
    return `Excellent! Let's practice describing what's happening in the story. On page ${currentPage.number}, ${currentPage.image_description || 'we can see an interesting scene'}. Can you describe what you see in your own words? Don't worry about making mistakes - practice makes perfect!`;
  }
  
  if (lowerMessage.includes('word') || lowerMessage.includes('vocabulary') || lowerMessage.includes('meaning')) {
    return `That's a great way to improve your vocabulary! ${currentPage.text_content ? `From the text on this page, let's pick some interesting words to practice. Try reading this sentence aloud: "${currentPage.text_content.split('.')[0]}."` : 'Let\'s practice some vocabulary from this page.'} Which words would you like to learn more about?`;
  }
  
  if (lowerMessage.includes('read') || lowerMessage.includes('practice')) {
    return `Perfect! Reading practice is so important. ${currentPage.text_content ? `Let's practice reading from page ${currentPage.number}. Try reading this part slowly and clearly: "${currentPage.text_content.substring(0, 150)}..." Take your time and focus on pronunciation!` : `Let's practice describing what we see on page ${currentPage.number}. Look at the image and try to describe it in English!`}`;
  }
  
  // Default encouraging response
  return `That's an interesting point! I love that you're engaging with "${book.title}". On page ${currentPage.number}, there's so much to explore. ${currentPage.image_description || 'The illustration shows us important details about the story.'} What aspect of this page would you like to practice speaking about? Remember, the more you practice speaking, the more confident you'll become!`;
};

export const speakingPracticeChat = async (req: Request, res: Response) => {
  try {
    const { message, history = [], context }: SpeakingPracticeChatRequest = req.body;

    // Validate required fields
    if (!message || !context || !context.book || !context.currentPage) {
      return res.status(400).json({ 
        error: 'Missing required fields: message, context.book, and context.currentPage are required' 
      });
    }

    // Generate AI response
    const aiResponse = await generateSpeakingPracticeResponse(message, history, context);

    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in speaking practice chat:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export default [authenticateToken, speakingPracticeChat];