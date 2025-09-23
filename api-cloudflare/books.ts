import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { verifyToken, jwtMiddleware, type SessionPayload } from './utils/jwt';

// Enhanced logging utility
const logger = {
  error: (message: string, error?: any, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: 'ERROR',
      message,
      error: error?.message || error,
      stack: error?.stack,
      ...context
    };
    console.error(JSON.stringify(logData));
  },
  warn: (message: string, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: 'WARN',
      message,
      ...context
    };
    console.warn(JSON.stringify(logData));
  },
  info: (message: string, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: 'INFO',
      message,
      ...context
    };
    console.log(JSON.stringify(logData));
  }
};

// Error recovery utility
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Operation failed, attempt ${attempt}/${maxRetries}`, { 
        error: error instanceof Error ? error.message : String(error),
        attempt 
      });
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
};

// OpenAI API response types
interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason: string;
  index: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  created: number;
  id: string;
  model: string;
  object: string;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

type BooksBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
    OPENAI_API_KEY: string;
    OPENAI_MODEL: string;
    OPENAI_VISION_MODEL: string;
    OPENAI_BASE_URL?: string;
    NODE_ENV?: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

const books = new Hono<BooksBindings>();

// Global error handler middleware
books.onError((err, c) => {
  logger.error('Unhandled error in books API', err, {
    path: c.req.path,
    method: c.req.method,
    headers: c.req.header(),
  });
  
  // Don't expose internal error details in production
  const isDev = c.env?.NODE_ENV === 'development';
  const errorMessage = isDev ? err.message : 'Internal server error';
  
  return c.json({ 
    error: errorMessage,
    reference: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, 500);
});

// Request logging middleware
books.use('*', async (c, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  logger.info('Request started', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('User-Agent'),
  });
  
  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: `${duration}ms`,
    });
  }
});

const parseNumberParam = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

books.get('/', async (c) => {
  const supabase = createSupabaseClient(c.env);
  const pageParam = c.req.query('page');
  const limitParam = c.req.query('limit');
  const difficulty = c.req.query('difficulty') ?? c.req.query('difficulty_level');
  const category = c.req.query('category');
  const targetAge = c.req.query('target_age');
  const search = c.req.query('search');

  const page = parseNumberParam(pageParam, 1);
  const limit = parseNumberParam(limitParam, 12);
  const offset = (page - 1) * limit;

  const authHeader = c.req.header('Authorization');
  let userId: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (secret) {
      const payload = await verifyToken(token, secret);
      if (payload) {
        userId = payload.userId;
      }
    }
  }

  let query = supabase
    .from('books')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.or(`is_public.eq.true,uploaded_by.eq.${userId}`);
  } else {
    query = query.eq('is_public', true);
  }

  if (difficulty) {
    query = query.eq('difficulty_level', difficulty);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (targetAge) {
    const age = Number(targetAge);
    if (Number.isFinite(age)) {
      query = query
        .lte('target_age_min', age)
        .gte('target_age_max', age);
    }
  }

  if (search) {
    const normalized = search.replace('%', '').trim();
    if (normalized) {
      query = query.or(`title.ilike.%${normalized}%,description.ilike.%${normalized}%`);
    }
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching books:', error);
    return c.json({ error: 'Failed to fetch books' }, 500);
  }

  return c.json({
    books: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: count ? Math.ceil(count / limit) : 0,
    },
  });
});

books.get('/:bookId', async (c) => {
  try {
    const { bookId } = c.req.param();
    
    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    let supabase;
    try {
      supabase = createSupabaseClient(c.env);
    } catch (dbError) {
      console.error('Failed to create Supabase client:', dbError);
      return c.json({ error: 'Database connection error' }, 500);
    }

    const authHeader = c.req.header('Authorization');
    let session: SessionPayload | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const secret = c.env.JWT_SECRET;
      if (secret) {
        try {
          session = await verifyToken(token, secret);
        } catch (tokenError) {
          console.error('Token verification error:', tokenError);
          // Continue without session for public books
        }
      }
    }

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();

  if (bookError || !book) {
    return c.json({ error: 'Book not found' }, 404);
  }

  let allowed = book.is_public === true;
  const role = session?.role;
  const userId = session?.userId;

  if (!allowed && role === 'admin') {
    allowed = true;
  }
  if (!allowed && userId && book.uploaded_by === userId) {
    allowed = true;
  }
  if (!allowed && userId) {
    const { data: lessons } = await supabase
      .from('lesson_plans')
      .select('id')
      .contains('assigned_students', [userId])
      .contains('book_ids', [bookId])
      .limit(1);

    if (lessons && lessons.length > 0) {
      allowed = true;
    }
  }

  if (!allowed) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const { data: pages, error: pagesError } = await supabase
    .from('book_pages')
    .select('*')
    .eq('book_id', bookId)
    .order('page_number', { ascending: true });

  if (pagesError) {
    console.error('Error fetching book pages:', pagesError);
    return c.json({ error: 'Failed to fetch book pages' }, 500);
  }

  return c.json({
    book: {
      ...book,
      pages: pages ?? [],
    },
  });
  } catch (error) {
    console.error('Error in GET /:bookId endpoint:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get vocabulary for books
books.get('/vocabulary', async (c) => {
  try {
    const bookId = c.req.query('book_id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const difficulty = c.req.query('difficulty');
    
    const supabase = createSupabaseClient(c.env);
    
    let query = supabase
      .from('vocabulary_words')
      .select(`
        *,
        books (
          id,
          title,
          difficulty_level
        )
      `)
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false });

    if (bookId) {
      query = query.eq('book_id', bookId);
    }

    if (difficulty) {
      query = query.eq('difficulty_level', difficulty);
    }

    const { data: vocabulary, error } = await query;

    if (error) {
      console.error('Error fetching vocabulary:', error);
      return c.json({ error: 'Failed to fetch vocabulary' }, 500);
    }

    return c.json({
      vocabulary: vocabulary || [],
      pagination: {
        page,
        limit,
        total: vocabulary?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in get vocabulary:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get discussions for books
books.get('/discussions', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization token required' }, 401);
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'JWT secret not configured' }, 500);
    }

    const payload = await verifyToken(token, secret);
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const bookId = c.req.query('book_id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    
    if (!bookId) {
      return c.json({ error: 'book_id parameter is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);
    
    const { data: discussions, error } = await supabase
      .from('book_discussions')
      .select(`
        *,
        books (
          id,
          title
        )
      `)
      .eq('book_id', bookId)
      .range((page - 1) * limit, page * limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching discussions:', error);
      return c.json({ error: 'Failed to fetch discussions' }, 500);
    }

    return c.json({
      discussions: discussions || [],
      pagination: {
        page,
        limit,
        total: discussions?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in get discussions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Learn vocabulary word
books.post('/vocabulary/learn', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization token required' }, 401);
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'JWT secret not configured' }, 500);
    }

    const payload = await verifyToken(token, secret);
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const { word_id } = await c.req.json();
    const userId = payload.userId;

    if (!word_id) {
      return c.json({ error: 'Word ID is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Check if word exists
    const { data: word, error: wordError } = await supabase
      .from('vocabulary_words')
      .select('id')
      .eq('id', word_id)
      .single();

    if (wordError || !word) {
      return c.json({ error: 'Vocabulary word not found' }, 404);
    }

    // Check if already learned
    const { data: existing } = await supabase
      .from('user_vocabulary')
      .select('id')
      .eq('user_id', userId)
      .eq('word_id', word_id)
      .single();

    if (existing) {
      return c.json({ error: 'Word already in user vocabulary' }, 409);
    }

    // Add to user vocabulary
    const { data: userVocab, error: vocabError } = await supabase
      .from('user_vocabulary')
      .insert({
        user_id: userId,
        word_id,
        mastery_level: 1
      })
      .select()
      .single();

    if (vocabError) {
      return c.json({ error: 'Failed to add word to vocabulary' }, 500);
    }

    return c.json({
      message: 'Word added to vocabulary successfully',
      user_vocabulary: {
        id: userVocab.id,
        word_id: userVocab.word_id,
        mastery_level: userVocab.mastery_level,
        learned_at: userVocab.learned_at
      }
    }, 201);
  } catch (error) {
    console.error('Learn vocabulary error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get learned vocabulary
books.get('/vocabulary/learned', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization token required' }, 401);
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'JWT secret not configured' }, 500);
    }

    const payload = await verifyToken(token, secret);
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const userId = payload.userId;

    const supabase = createSupabaseClient(c.env);

    const { data: learnedVocab, error } = await supabase
      .from('user_vocabulary')
      .select(`
        *,
        vocabulary_words (
          id,
          word,
          definition,
          difficulty_level,
          part_of_speech,
          example_sentence
        )
      `)
      .eq('user_id', userId)
      .range((page - 1) * limit, page * limit - 1)
      .order('learned_at', { ascending: false });

    if (error) {
      console.error('Error fetching learned vocabulary:', error);
      return c.json({ error: 'Failed to fetch learned vocabulary' }, 500);
    }

    return c.json({
      learned_vocabulary: learnedVocab || [],
      pagination: {
        page,
        limit,
        total: learnedVocab?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in get learned vocabulary:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});



// Helper function for basic image description
function generateBasicImageDescription(_imageUrl: string, context?: string): string {
  const contextDescriptions = {
    'cover': 'This is the cover of a children\'s book with colorful illustrations.',
    'story': 'This page shows an illustration from the story with characters and scenes.',
    'educational': 'This educational illustration helps children learn new concepts.',
    'default': 'This image shows an interesting scene that helps tell the story.'
  };

  const contextKey = context?.toLowerCase() || 'default';
  return contextDescriptions[contextKey as keyof typeof contextDescriptions] || contextDescriptions.default;
}

// POST /analyze-image - Analyze image and extract description and vocabulary
books.post('/analyze-image', jwtMiddleware, async (c) => {
  // Declare variables outside try block for scope access in catch blocks
  let image_url: string = '';
  let page_id: string | undefined;
  let context: string | undefined;
  let timeoutId: number | null = null;

  try {
    // Get user from JWT middleware context
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    let requestData;
    try {
      requestData = await c.req.json();
    } catch (jsonError) {
      console.error('Failed to parse request JSON:', jsonError);
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }

    image_url = requestData.image_url;
    page_id = requestData.page_id;
    context = requestData.context;

    if (!image_url) {
      return c.json({ error: 'Image URL is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Enhanced image analysis using OpenAI GPT-4 Vision
      let openaiResponse;
      try {
        // Check if OpenAI configuration is available and valid
        if (!c.env.OPENAI_API_KEY || 
            c.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
            c.env.OPENAI_API_KEY.length < 10) {
          console.warn('OpenAI configuration missing or invalid, falling back to basic description');
          const basicDescription = generateBasicImageDescription(image_url, context);
          return c.json({ description: basicDescription, vocabulary: [] });
        }

        // Use the configured base URL or default to OpenAI
        const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

        const controller = new AbortController();
        timeoutId = setTimeout(() => {
          console.log('AI Vision API timeout triggered');
          controller.abort();
        }, 60000) as unknown as number; // 60 second timeout for vision API
        
        try {
          openaiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: c.env.OPENAI_VISION_MODEL || 'gpt-4-vision-preview',
            messages: [
              {
                role: 'system',
                content: 'You are an educational assistant for children learning English. Analyze the image and provide a detailed, engaging, age-appropriate description suitable for a children\'s book. Also extract 3-5 key vocabulary words that children can learn from this image. Focus on describing what\'s happening in the scene, the characters, their emotions, and the setting. Make it vivid, educational, and engaging for young learners. Return a JSON response with "description" (string) and "vocabulary" (array of objects with "word", "definition", and "difficulty_level" fields).'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Please analyze this image from a children's book and provide a detailed, engaging description. Context: ${context || 'General children\'s book illustration'}. Provide an educational description suitable for children aged 3-12, including sensory details and emotional elements that will help children connect with the story. Also identify key vocabulary words they can learn from this scene.`
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: image_url,
                      detail: 'high'
                    }
                  }
                ]
              }
            ],
            max_tokens: 1200,
            temperature: 0.3
          }),
          signal: controller.signal
        });
        if (timeoutId) clearTimeout(timeoutId);
      } catch (abortError) {
        if (timeoutId) clearTimeout(timeoutId);
        if (abortError instanceof Error && abortError.name === 'AbortError') {
          console.error('OpenAI Vision API timeout after 30 seconds');
          // Fallback to basic description on timeout
          const basicDescription = generateBasicImageDescription(image_url, context);
          return c.json({ description: basicDescription, vocabulary: [] });
        }
        throw abortError;
      }
    } catch (fetchError) {
      console.error('OpenAI Vision API fetch error:', fetchError);
      // Fallback to basic description on network error
      const basicDescription = generateBasicImageDescription(image_url, context);
      return c.json({ description: basicDescription, vocabulary: [] });
    }

    if (!openaiResponse.ok) {
      console.error('OpenAI Vision API error:', await openaiResponse.text());
      // Fallback to basic description
      const basicDescription = generateBasicImageDescription(image_url, context);
      return c.json({ description: basicDescription, vocabulary: [] });
    }

    const openaiResult = await openaiResponse.json() as OpenAIResponse;
    const aiContent = openaiResult.choices[0]?.message?.content;

    try {
      const analysis = JSON.parse(aiContent);
      
      // Update page with image description if page_id provided
      if (page_id) {
        const { error: updateError } = await supabase
          .from('book_pages')
          .update({ image_description: analysis.description })
          .eq('id', page_id);

        if (updateError) {
          console.error('Failed to update page with image description:', updateError);
        }
      }

      return c.json({
        description: analysis.description || 'This image shows an interesting scene from the story.',
        vocabulary: analysis.vocabulary || [],
        updated_page: !!page_id
      });
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to basic description if AI response is not valid JSON
      const basicDescription = image_url ? generateBasicImageDescription(image_url, context) : 'Unable to analyze image';
      return c.json({ description: basicDescription, vocabulary: [] });
    }
  } catch (error) {
    // Cleanup timeout if still active
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error('Image analysis error:', error);
    
    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes('JSON')) {
        return c.json({ error: 'Invalid request format' }, 400);
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        return c.json({ error: 'Network error occurred' }, 503);
      } else if (error.message.includes('timeout')) {
        return c.json({ error: 'Request timeout' }, 408);
      }
    }
    
    // Fallback to basic description if image_url is available
    if (!image_url) {
      return c.json({ error: 'Invalid request data' }, 400);
    }
    
    try {
      const basicDescription = generateBasicImageDescription(image_url, context);
      return c.json({ description: basicDescription, vocabulary: [] });
    } catch (fallbackError) {
      console.error('Failed to generate fallback description:', fallbackError);
      return c.json({ error: 'Unable to analyze image' }, 500);
    }
  }
});

// Helper function for basic vocabulary extraction
function extractBasicVocabulary(description: string, difficultyLevel: string, maxWords: number) {
  const words = description.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && word.length < 12)
    .slice(0, maxWords);

  return words.map(word => ({
    word: word,
    definition: `A word meaning ${word}`,
    difficulty_level: difficultyLevel,
    part_of_speech: 'noun',
    example_sentence: `This is an example with ${word}.`
  }));
}

// Extract vocabulary endpoint
books.post('/extract-vocabulary', jwtMiddleware, async (c) => {
  try {
    const { description, difficulty_level = 'beginner', max_words = 5 } = await c.req.json();
    const user = c.get('user');

    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);
    let extractedVocabulary = [];

    try {
      // Check if OpenAI configuration is available
      const openaiApiKey = c.env.OPENAI_API_KEY;
      const openaiModel = c.env.OPENAI_MODEL || 'gpt-4';

      if (!openaiApiKey || openaiApiKey === 'your-openai-api-key-here' || openaiApiKey.length < 10) {
        logger.info('OpenAI configuration missing, using basic vocabulary extraction');
        extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
      } else {
        // Use OpenAI for intelligent vocabulary extraction
        const response = await withRetry(async () => {
          // Use the configured base URL or default to OpenAI
          const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
          const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
          
          return await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: openaiModel,
              messages: [
                {
                  role: 'system',
                  content: `You are an educational assistant for children learning English. Extract ${max_words} key vocabulary words from the given description that are appropriate for ${difficulty_level} level learners. Return a JSON array of objects with "word", "definition", "difficulty_level", "part_of_speech", and "example_sentence" fields.`
                },
                {
                  role: 'user',
                  content: `Extract educational vocabulary from this description: "${description}". Focus on words that children can learn and use in their daily conversations.`
                }
              ],
              max_tokens: 500,
              temperature: 0.3
            }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
        }, 2, 1000);

        if (response.ok) {
          const openaiResult = await response.json() as OpenAIResponse;
          const aiContent = openaiResult.choices[0]?.message?.content;
          
          try {
            extractedVocabulary = JSON.parse(aiContent);
          } catch (parseError) {
            logger.warn('Failed to parse AI vocabulary response', { error: parseError });
            extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
          }
        } else {
          logger.warn('OpenAI API failed, using basic vocabulary extraction', { status: response.status });
          extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
        }
      }
    } catch (error) {
      logger.warn('Vocabulary extraction error, falling back to basic extraction', { error });
      extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
    }

    // Store extracted vocabulary in database
    const vocabularyToStore = [];
    for (const vocab of extractedVocabulary) {
      try {
        // Check if word already exists
        const { data: existingWord, error: selectError } = await supabase
          .from('vocabulary_words')
          .select('id')
          .eq('word', vocab.word.toLowerCase())
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          logger.error('Error checking existing word', selectError, { word: vocab.word });
          continue;
        }

        if (!existingWord) {
          // Insert new vocabulary word with only existing columns
          const { data: newWord, error: insertError } = await supabase
            .from('vocabulary_words')
            .insert({
              word: vocab.word.toLowerCase(),
              definition: vocab.definition,
              difficulty_level: vocab.difficulty_level || difficulty_level
            })
            .select()
            .single();

          if (!insertError && newWord) {
            vocabularyToStore.push(newWord);
          } else if (insertError) {
            logger.error('Error inserting vocabulary word', insertError, { word: vocab.word });
          }
        } else {
          vocabularyToStore.push({ id: existingWord.id, ...vocab });
        }
      } catch (error) {
        logger.error('Error processing vocabulary word', error, { word: vocab.word });
      }
    }

    return c.json({
      message: `Extracted ${extractedVocabulary.length} vocabulary words`,
      vocabulary: extractedVocabulary,
      stored_count: vocabularyToStore.length
    });
  } catch (error) {
    logger.error('Extract vocabulary error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});



// Batch analyze images for a book
books.post('/:bookId/analyze-images', jwtMiddleware, async (c) => {
  try {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    const user = c.get('user');
    const supabase = createSupabaseClient(c.env);

    // Verify book exists and user has permission (admin only for batch operations)
    if (user.role !== 'admin') {
      return c.json({ error: 'Admin access required for batch operations' }, 403);
    }

    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, title')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      logger.error('Book not found for batch analysis', bookError, { bookId, userId: user.userId });
      return c.json({ error: 'Book not found' }, 404);
    }

    // Get all pages for this book that don't have descriptions
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('id, page_number, image_url, image_description')
      .eq('book_id', bookId)
      .order('page_number');

    if (pagesError) {
      logger.error('Failed to fetch book pages for batch analysis', pagesError, { bookId });
      return c.json({ error: 'Failed to fetch book pages' }, 500);
    }

    if (!pages || pages.length === 0) {
      return c.json({ error: 'No pages found for this book' }, 404);
    }

    const results = {
      total_pages: pages.length,
      analyzed_pages: 0,
      skipped_pages: 0,
      failed_pages: 0,
      details: [] as Array<{
        page_id: string;
        page_number: number;
        status: 'analyzed' | 'skipped' | 'failed';
        error?: string;
      }>
    };

    logger.info('Starting batch image analysis', { 
      bookId, 
      bookTitle: bookData.title, 
      totalPages: pages.length,
      userId: user.userId 
    });

    // Process each page
    for (const page of pages) {
      try {
        // Skip pages that already have descriptions
        if (page.image_description && page.image_description.trim()) {
          results.skipped_pages++;
          results.details.push({
            page_id: page.id,
            page_number: page.page_number,
            status: 'skipped'
          });
          continue;
        }

        // Add delay to avoid rate limiting (2 seconds between requests)
        if (results.analyzed_pages > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Analyze the image
        const analysisResult = await withRetry(async () => {
          // Use the configured base URL or default to OpenAI
          const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
          const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: c.env.OPENAI_VISION_MODEL || 'gpt-4-vision-preview',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Analyze this children's book page image. Provide a detailed, educational description suitable for English language learners. Focus on objects, characters, actions, and educational content. Keep it age-appropriate and engaging. This is page ${page.page_number} of "${bookData.title}".`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: page.image_url
                      }
                    }
                  ]
                }
              ],
              max_tokens: 1000
            }),
            signal: AbortSignal.timeout(30000) // 30 second timeout
          });

          if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
          }

          return await response.json() as OpenAIResponse;
        }, 2, 1000);

        const description = analysisResult.choices[0]?.message?.content;
        if (!description) {
          throw new Error('No description generated by AI');
        }

        // Update the page with the new description
        const { error: updateError } = await supabase
          .from('book_pages')
          .update({ image_description: description })
          .eq('id', page.id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        results.analyzed_pages++;
        results.details.push({
          page_id: page.id,
          page_number: page.page_number,
          status: 'analyzed'
        });

        logger.info('Successfully analyzed page', { 
          pageId: page.id, 
          pageNumber: page.page_number, 
          bookId 
        });

      } catch (error) {
        results.failed_pages++;
        results.details.push({
          page_id: page.id,
          page_number: page.page_number,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        logger.error('Failed to analyze page', error, { 
          pageId: page.id, 
          pageNumber: page.page_number, 
          bookId 
        });
      }
    }

    logger.info('Batch image analysis completed', { 
      bookId, 
      results,
      userId: user.userId 
    });

    return c.json({
      message: `Batch analysis completed for ${bookData.title}`,
      results
    });

  } catch (error) {
    logger.error('Batch image analysis error', error, { bookId: c.req.param('bookId') });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

books.post('/:bookId/pages/:pageId/regenerate-description', jwtMiddleware, async (c) => {
  let timeoutId: number | null = null;
  
  try {
    const { bookId, pageId } = c.req.param();
    
    // Validate parameters
    if (!bookId || !pageId) {
      return c.json({ error: 'Missing required parameters' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // 1. Get the page information with error handling
    let page, pageError;
    try {
      const result = await supabase
        .from('book_pages')
        .select('image_url, page_number')
        .eq('id', pageId)
        .eq('book_id', bookId)
        .single();
      page = result.data;
      pageError = result.error;
    } catch (dbError) {
      console.error('Database error fetching page:', dbError);
      return c.json({ error: 'Database connection error' }, 500);
    }

    if (pageError || !page) {
      console.error('Failed to fetch page:', pageError);
      return c.json({ error: 'Page not found' }, 404);
    }

    if (!page.image_url) {
      return c.json({ error: 'Page has no image to analyze' }, 400);
    }

    // 2. Get book context for better description with error handling
    let book = null;
    try {
      const result = await supabase
        .from('books')
        .select('title, description, target_age_min, target_age_max')
        .eq('id', bookId)
        .single();
      book = result.data;
    } catch (dbError) {
      console.warn('Failed to fetch book context:', dbError);
      // Continue without book context
    }

    const context = book ? `This is page ${page.page_number} from "${book.title}", a children's book for ages ${book.target_age_min}-${book.target_age_max}. ${book.description || ''}` : undefined;

    let newDescription: string | null = null;

    // 3. Try to generate description using OpenAI with comprehensive error handling
    try {
      // Validate OpenAI configuration
      if (!c.env.OPENAI_API_KEY || c.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI API key not configured properly');
        throw new Error('OpenAI configuration invalid');
      }

      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        console.log('OpenAI request timeout triggered');
        controller.abort();
      }, 60000) as unknown as number; // 60 second timeout

      let openaiResponse;
      try {
        // Use the configured base URL or default to OpenAI
        const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
        
        openaiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: c.env.OPENAI_VISION_MODEL || 'gpt-4-vision-preview',
            messages: [
              {
                role: 'system',
                content: 'You are an educational assistant for children learning English. Analyze the image and provide a detailed, engaging, age-appropriate description suitable for a children\'s book. Focus on describing what\'s happening in the scene, the characters, their emotions, and the setting. Make it vivid, educational, and engaging for young learners.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Please analyze this image from a children's book and provide a detailed, engaging description. ${context ? `Context: ${context}` : 'This is from a children\'s book illustration.'} Focus on describing what's happening in the scene, the characters, their emotions, and the setting. Make it vivid, educational, and age-appropriate for children aged 3-12. Include sensory details and emotional elements that will help children connect with the story.`
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: page.image_url,
                      detail: 'high'
                    }
                  }
                ]
              }
            ],
            max_tokens: 1200,
            temperature: 0.3
          }),
          signal: controller.signal
        });
      } catch (fetchError) {
        if (timeoutId) clearTimeout(timeoutId);
        throw fetchError;
      }

      if (timeoutId) clearTimeout(timeoutId);

      if (openaiResponse && openaiResponse.ok) {
        try {
          const openaiResult = await openaiResponse.json() as OpenAIResponse;
          if (openaiResult.choices && openaiResult.choices[0] && openaiResult.choices[0].message) {
            newDescription = openaiResult.choices[0].message.content || null;
          }
        } catch (jsonError) {
          console.error('Failed to parse OpenAI response:', jsonError);
          throw new Error('Invalid OpenAI response format');
        }
      } else {
        const errorText = openaiResponse ? await openaiResponse.text().catch(() => 'Unknown error') : 'No response';
        console.error('OpenAI API error:', errorText);
        throw new Error(`OpenAI API error: ${errorText}`);
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('AI image analysis timed out after 120 seconds');
      } else {
        console.log('AI image analysis failed:', error instanceof Error ? error.message : String(error));
      }
      // Continue to fallback description
    }

    if (!newDescription) {
      // Fallback to basic description
      try {
        newDescription = generateBasicImageDescription(page.image_url, context);
      } catch (fallbackError) {
        console.error('Failed to generate fallback description:', fallbackError);
        newDescription = 'This page contains an illustration from the story.';
      }
    }

    // 4. Update the page with the new description with comprehensive error handling
    try {
      const { data: updatedPage, error: updateError } = await supabase
        .from('book_pages')
        .update({ image_description: newDescription })
        .eq('id', pageId)
        .select();

      if (updateError) {
        console.error('Failed to update page with new description:', updateError);
        return c.json({ error: 'Failed to save new description' }, 500);
      }

      if (!updatedPage || updatedPage.length === 0) {
        console.error('No page was updated - page ID may not exist:', pageId);
        return c.json({ error: 'Page not found or could not be updated' }, 404);
      }

      return c.json({
        message: 'Description regenerated successfully',
        description: newDescription
      });
    } catch (dbUpdateError) {
      console.error('Database update error:', dbUpdateError);
      return c.json({ error: 'Database update failed' }, 500);
    }

  } catch (error) {
    // Cleanup timeout if still active
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error('Regenerate description error:', error);
    
    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return c.json({ error: 'Network error occurred' }, 503);
      } else if (error.message.includes('timeout')) {
        return c.json({ error: 'Request timeout' }, 408);
      } else if (error.message.includes('Database')) {
        return c.json({ error: 'Database error' }, 500);
      }
    }
    
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default books;
