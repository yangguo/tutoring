import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { verifyToken, jwtMiddleware, type SessionPayload } from './utils/jwt';

// Enhanced logging utility
const logger = {
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const logData: Record<string, unknown> = {
      timestamp,
      level: 'ERROR',
      message,
      ...context
    };

    if (error instanceof Error) {
      logData.error = error.message;
      if (error.stack) {
        logData.stack = error.stack;
      }
    } else if (error !== undefined) {
      logData.error = String(error);
    }

    console.error(JSON.stringify(logData));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: 'WARN',
      message,
      ...context
    };
    console.warn(JSON.stringify(logData));
  },
  info: (message: string, context?: Record<string, unknown>) => {
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

const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB limit for inline images
const DEFAULT_OPENAI_VISION_TIMEOUT_MS = 180_000; // 3 minutes, matches Express API default

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
};

async function getInlineImageUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      logger.warn('Failed to fetch image for OpenAI request', {
        imageUrl,
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    if (!arrayBuffer.byteLength) {
      logger.warn('Fetched image is empty, skipping inline conversion', { imageUrl });
      return null;
    }

    if (arrayBuffer.byteLength > INLINE_IMAGE_MAX_BYTES) {
      logger.warn('Fetched image exceeds inline size limit, falling back to public URL', {
        imageUrl,
        bytes: arrayBuffer.byteLength
      });
      return null;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    return `data:${contentType};base64,${arrayBufferToBase64(arrayBuffer)}`;
  } catch (error) {
    logger.warn('Unable to inline image for OpenAI request', {
      imageUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Error recovery utility
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: unknown;
  
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
    OPENAI_MODEL?: string;
    OPENAI_VISION_MODEL?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_VISION_TIMEOUT_MS?: string;
    NODE_ENV?: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

type VocabularyEntry = {
  word: string;
  definition: string;
  difficulty_level?: string;
  part_of_speech?: string;
  example_sentence?: string;
};

type ImageAnalysisResult = {
  description: string;
  vocabulary: VocabularyEntry[];
};

type AnalyzeImageRequestPayload = {
  image_url?: string;
  page_id?: string;
  context?: string;
};

type ExtractVocabularyPayload = {
  description?: string;
  difficulty_level?: string;
  max_words?: number;
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
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  let requestData: AnalyzeImageRequestPayload;
  try {
    requestData = await c.req.json<AnalyzeImageRequestPayload>();
  } catch (jsonError) {
    logger.error('Failed to parse request JSON', jsonError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  if (!requestData || typeof requestData !== 'object') {
    logger.warn('Invalid analyze-image request payload structure');
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const image_url: string | undefined = requestData.image_url;
  const page_id: string | undefined = requestData.page_id;
  const context: string | undefined = requestData.context;

  if (!image_url) {
    return c.json({ error: 'Image URL is required' }, 400);
  }

  const supabase = createSupabaseClient(c.env);

  const fallbackAnalysis = (): ImageAnalysisResult => ({
    description: generateBasicImageDescription(image_url, context),
    vocabulary: []
  });

  let analysisResult: ImageAnalysisResult | null = null;
  let usedFallback = false;
  const fallbackReasons: string[] = [];

  const ensureFallback = (reason: string, err?: unknown) => {
    fallbackReasons.push(reason);
    const contextData: Record<string, unknown> = {
      image_url,
      reason
    };
    if (err instanceof Error) {
      contextData.error = err.message;
    } else if (err !== undefined) {
      contextData.error = String(err);
    }
    logger.warn(reason, contextData);
    if (!usedFallback) {
      usedFallback = true;
      analysisResult = fallbackAnalysis();
    }
  };

  const hasValidOpenAIConfig = Boolean(
    c.env.OPENAI_API_KEY &&
    c.env.OPENAI_API_KEY !== 'your-openai-api-key-here' &&
    c.env.OPENAI_API_KEY.length >= 10
  );

  if (!hasValidOpenAIConfig) {
    ensureFallback('OpenAI configuration missing or invalid, using basic image description.');
  } else {
    const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiUrl = `${baseUrl}/chat/completions`;
    const visionTimeoutRaw = c.env.OPENAI_VISION_TIMEOUT_MS;
    const parsedTimeout = visionTimeoutRaw ? Number.parseInt(visionTimeoutRaw, 10) : Number.NaN;
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : DEFAULT_OPENAI_VISION_TIMEOUT_MS;

    const controller = new AbortController();
    const startTime = Date.now();
    timeoutId = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      logger.warn('AI Vision API timeout triggered', { elapsed, timeoutMs, image_url });
      controller.abort();
    }, timeoutMs);

    try {
      const openaiVisionModel = c.env.OPENAI_VISION_MODEL || 'gpt-4-turbo';
      const inlineImageUrl = await getInlineImageUrl(image_url);
      const openaiImageSource = inlineImageUrl ?? image_url;

      const openaiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openaiVisionModel,
          messages: [
            {
              role: 'system',
              content: 'You are an educational assistant for children learning English. Provide a detailed, age-appropriate description for this book page.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please describe this children\'s book page image clearly and engagingly. Focus on characters, actions, setting, and any educational details.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: openaiImageSource,
                    detail: inlineImageUrl ? undefined : 'auto'
                  }
                }
              ]
            }
          ],
          max_tokens: 512,
          temperature: 0.3
        }),
        signal: controller.signal
      });

      const elapsed = Date.now() - startTime;
      logger.info('OpenAI Vision API request completed', { elapsed, image_url });

      if (!openaiResponse.ok) {
        logger.error('OpenAI Vision API returned non-200 response', await openaiResponse.text());
        ensureFallback('OpenAI Vision API returned a non-200 response.');
      } else {
        const openaiResult = await openaiResponse.json() as OpenAIResponse;
        const rawContent = openaiResult.choices?.[0]?.message?.content;

        const extractContentString = (content: unknown): string | null => {
          if (!content) return null;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            return content
              .map(part => {
                if (typeof part === 'string') return part;
                if (typeof part === 'object' && part && 'text' in part) {
                  return String((part as { text?: string }).text ?? '');
                }
                return '';
              })
              .join('\n')
              .trim() || null;
          }
          return null;
        };

        const cleanedContent = extractContentString(rawContent)
          ?.replace(/```json|```/g, '')
          .trim();

        if (!cleanedContent) {
          ensureFallback('OpenAI Vision response missing content.');
        } else {
          analysisResult = {
            description: cleanedContent,
            vocabulary: []
          };
        }
      }
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        logger.error('OpenAI Vision API request aborted due to timeout', fetchError, { timeoutMs });
        ensureFallback('OpenAI Vision API request timed out.', fetchError);
      } else {
        logger.error('OpenAI Vision API request failed', fetchError);
        ensureFallback('OpenAI Vision API request failed.', fetchError);
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = null;
    }
  }

  if (!analysisResult) {
    ensureFallback('OpenAI analysis did not produce a result.');
  }

  const { description, vocabulary } = analysisResult!;

  if (page_id && description) {
    try {
      const { error: updateError } = await supabase
        .from('book_pages')
        .update({ image_description: description })
        .eq('id', page_id);

      if (updateError) {
        logger.error('Failed to update page with image description', updateError, { page_id });
      }
    } catch (updateError) {
      logger.error('Unexpected error while updating page with image description', updateError, { page_id });
    }
  }

  return c.json({
    description,
    vocabulary,
    updated_page: !!page_id,
    used_fallback: usedFallback,
    fallback_reasons: usedFallback ? fallbackReasons : []
  });
});

// Helper function for basic vocabulary extraction
function extractBasicVocabulary(description: string, difficultyLevel: string, maxWords: number): VocabularyEntry[] {
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which',
    'their', 'time', 'will', 'about', 'would', 'there', 'could', 'other', 'more', 'very',
    'what', 'know', 'just', 'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life',
    'only', 'still', 'should', 'after', 'being', 'made', 'before', 'here', 'through', 'when',
    'where', 'much', 'some', 'these', 'many', 'then', 'them', 'well'
  ]);

  const words = description.toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(' ')
    .filter(word => word.length > 3 && word.length < 12)
    .filter(word => !stopWords.has(word));

  const uniqueWords = [...new Set(words)].slice(0, maxWords);

  return uniqueWords.map(word => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    definition: `A word that appears in the story: ${word}`,
    difficulty_level: difficultyLevel,
    part_of_speech: 'noun',
    example_sentence: `The story mentions ${word}.`
  }));
}

// Extract vocabulary endpoint
books.post('/extract-vocabulary', jwtMiddleware, async (c) => {
  try {
    let payload: ExtractVocabularyPayload;
    try {
      payload = await c.req.json<ExtractVocabularyPayload>();
    } catch (jsonError) {
      logger.error('Failed to parse vocabulary extraction JSON', jsonError);
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }

    if (!payload || typeof payload !== 'object' || typeof payload.description !== 'string') {
      return c.json({ error: 'Description is required' }, 400);
    }

    const user = c.get('user');
    const description = payload.description;
    const difficulty_level = payload.difficulty_level ?? 'beginner';
    const max_words = payload.max_words ?? 5;

    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);
    let extractedVocabulary: VocabularyEntry[] = [];

    try {
      const hasValidOpenAIConfig = Boolean(
        c.env.OPENAI_API_KEY &&
        c.env.OPENAI_API_KEY !== 'your-openai-api-key-here' &&
        c.env.OPENAI_API_KEY.length >= 10
      );

      if (!hasValidOpenAIConfig) {
        logger.info('OpenAI configuration missing, using basic vocabulary extraction');
        extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
      } else {
        const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        const apiUrl = `${baseUrl}/chat/completions`;
        const openaiModel = c.env.OPENAI_MODEL || 'gpt-4';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        let response: Response;
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
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
            signal: controller.signal
          });
        } catch (abortError) {
          clearTimeout(timeoutId);
          throw abortError;
        }

        clearTimeout(timeoutId);

        if (response.ok) {
          const openaiResult = await response.json() as OpenAIResponse;
          const rawContent = openaiResult.choices?.[0]?.message?.content;

          const extractContentString = (content: unknown): string | null => {
            if (!content) return null;
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
              return content
                .map(part => {
                  if (typeof part === 'string') return part;
                  if (typeof part === 'object' && part && 'text' in part) {
                    return String((part as { text?: string }).text ?? '');
                  }
                  return '';
                })
                .join('\n')
                .trim() || null;
            }
            return null;
          };

          const cleanedContent = extractContentString(rawContent)
            ?.replace(/```json|```/g, '')
            .trim();

          if (cleanedContent) {
            try {
              extractedVocabulary = JSON.parse(cleanedContent);
            } catch (parseError) {
              logger.warn('Failed to parse AI vocabulary response', {
                error: parseError instanceof Error ? parseError.message : parseError
              });
              extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
            }
          } else {
            logger.warn('OpenAI vocabulary response missing content');
            extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
          }
        } else {
          logger.warn('OpenAI API failed, using basic vocabulary extraction', { status: response.status });
          extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
        }
      }
    } catch (error) {
      logger.warn('Vocabulary extraction error, falling back to basic extraction', {
        error: error instanceof Error ? error.message : error
      });
      extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
    }

    const vocabularyToStore: Array<Record<string, unknown>> = [];
    for (const vocab of extractedVocabulary) {
      if (!vocab?.word) {
        continue;
      }

      try {
        const wordLower = String(vocab.word).toLowerCase();
        const { data: existingWord, error: selectError } = await supabase
          .from('vocabulary_words')
          .select('id')
          .eq('word', wordLower)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          logger.error('Error checking existing word', selectError, { word: vocab.word });
          continue;
        }

        if (!existingWord) {
          const insertPayload = {
            word: wordLower,
            definition: vocab.definition,
            difficulty_level: vocab.difficulty_level || difficulty_level,
            part_of_speech: vocab.part_of_speech || 'noun',
            example_sentence: vocab.example_sentence || `This is an example with ${vocab.word}.`,
            ...(user?.userId ? { created_by: user.userId } : {})
          };

          const { data: newWord, error: insertError } = await supabase
            .from('vocabulary_words')
            .insert(insertPayload)
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

// Regenerate all image descriptions for a book
books.post('/:bookId/regenerate-all-descriptions', jwtMiddleware, async (c) => {
  try {
    const { bookId } = c.req.param();
    const user = c.get('user');
    
    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Verify book exists and user has permission
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Check permissions: admin or book owner
    if (user.role !== 'admin' && book.uploaded_by !== user.userId) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Get all pages for this book that have images
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('id, page_number, image_url, image_description')
      .eq('book_id', bookId)
      .order('page_number');

    if (pagesError) {
      console.error('Failed to fetch book pages:', pagesError);
      return c.json({ error: 'Failed to fetch book pages' }, 500);
    }

    if (!pages || pages.length === 0) {
      return c.json({ error: 'No pages found for this book' }, 404);
    }

    const results = {
      total_pages: pages.length,
      regenerated_pages: 0,
      failed_pages: 0,
      details: [] as Array<{
        page_id: string;
        page_number: number;
        status: 'regenerated' | 'failed';
        error?: string;
      }>
    };

    logger.info('Starting batch image description regeneration', { 
      bookId, 
      bookTitle: book.title, 
      totalPages: pages.length,
      userId: user.userId 
    });

    // Process each page
    for (const page of pages) {
      try {
        if (!page.image_url) {
          results.failed_pages++;
          results.details.push({
            page_id: page.id,
            page_number: page.page_number,
            status: 'failed',
            error: 'No image URL found'
          });
          continue;
        }

        // Add delay to avoid rate limiting (3 seconds between requests)
        if (results.regenerated_pages > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        let newDescription: string | null = null;

        // Try to generate description using OpenAI
        try {
          if (!c.env.OPENAI_API_KEY || c.env.OPENAI_API_KEY.length < 10) {
            throw new Error('OpenAI configuration invalid');
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000) as unknown as number; // 180 second timeout (3 minutes)

          const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
          const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
          
          const openaiResponse = await fetch(apiUrl, {
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
                      text: `Please analyze this image from a children's book and provide a detailed, engaging description. This is page ${page.page_number} from "${book.title}". Focus on describing what's happening in the scene, the characters, their emotions, and the setting. Make it vivid, educational, and age-appropriate for children aged 3-12. Include sensory details and emotional elements that will help children connect with the story.`
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

          clearTimeout(timeoutId);

          if (openaiResponse.ok) {
            const openaiResult = await openaiResponse.json() as OpenAIResponse;
            if (openaiResult.choices && openaiResult.choices[0] && openaiResult.choices[0].message) {
              newDescription = openaiResult.choices[0].message.content || null;
            }
          }
        } catch (aiError) {
          console.warn('AI generation failed for page:', page.page_number, aiError);
        }

        // Fallback to basic description if AI failed
        if (!newDescription) {
          newDescription = generateBasicImageDescription(page.image_url, `Page ${page.page_number} from ${book.title}`);
        }

        // Update the page with the new description
        const { error: updateError } = await supabase
          .from('book_pages')
          .update({ image_description: newDescription })
          .eq('id', page.id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        results.regenerated_pages++;
        results.details.push({
          page_id: page.id,
          page_number: page.page_number,
          status: 'regenerated'
        });

        logger.info('Successfully regenerated description for page', { 
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

        logger.error('Failed to regenerate description for page', error, { 
          pageId: page.id, 
          pageNumber: page.page_number, 
          bookId 
        });
      }
    }

    logger.info('Batch image description regeneration completed', { 
      bookId, 
      results,
      userId: user.userId 
    });

    return c.json({
      message: `Batch regeneration completed for ${book.title}`,
      results
    });

  } catch (error) {
    logger.error('Batch regeneration error', error, { bookId: c.req.param('bookId') });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

books.post('/:bookId/pages/:pageId/regenerate-description', jwtMiddleware, async (c) => {
  let timeoutId: number | null = null;
  
  // Helper function to add timeout to database operations
  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database operation timed out'));
      }, timeoutMs);
      
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  };

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
      const result = await withTimeout(
        (async () => {
          return await supabase
            .from('book_pages')
            .select('image_url, page_number')
            .eq('id', pageId)
            .eq('book_id', bookId)
            .single();
        })(),
        30000 // 30 second timeout for database operations
      );
      page = result.data;
      pageError = result.error;
    } catch (dbError) {
      console.error('Database error fetching page:', {
        error: dbError,
        message: dbError instanceof Error ? dbError.message : String(dbError),
        stack: dbError instanceof Error ? dbError.stack : undefined,
        bookId,
        pageId
      });
      
      // Provide more specific error information
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
        return c.json({ error: 'Network connection lost', details: errorMessage }, 503);
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return c.json({ error: 'Database operation timed out', details: errorMessage }, 408);
      }
      
      return c.json({ error: 'Database connection error', details: errorMessage }, 500);
    }

    if (pageError || !page) {
      console.error('Failed to fetch page:', {
        pageError,
        bookId,
        pageId,
        hasPage: !!page
      });
      return c.json({ error: 'Page not found' }, 404);
    }

    if (!page.image_url) {
      return c.json({ error: 'Page has no image to analyze' }, 400);
    }

    // 2. Get book context for better description with error handling
    let book = null;
    try {
      const result = await withTimeout(
        (async () => {
          return await supabase
            .from('books')
            .select('title, description, target_age_min, target_age_max')
            .eq('id', bookId)
            .single();
        })(),
        15000 // 15 second timeout for book context (less critical)
      );
      book = result.data;
    } catch (dbError) {
      console.warn('Failed to fetch book context:', {
        error: dbError,
        message: dbError instanceof Error ? dbError.message : String(dbError),
        bookId
      });
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
      }, 180000) as unknown as number; // 180 second timeout (3 minutes)

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
      const result = await withTimeout(
        (async () => {
          return await supabase
            .from('book_pages')
            .update({ image_description: newDescription })
            .eq('id', pageId)
            .select();
        })(),
        30000 // 30 second timeout for database operations
      );
      
      const { data: updatedPage, error: updateError } = result;

      if (updateError) {
        console.error('Failed to update page with new description:', {
          updateError,
          bookId,
          pageId,
          descriptionLength: newDescription ? newDescription.length : 0
        });
        return c.json({ error: 'Failed to save new description', details: updateError.message }, 500);
      }

      if (!updatedPage || updatedPage.length === 0) {
        console.error('No page was updated - page ID may not exist:', {
          pageId,
          bookId,
          updatedPageCount: updatedPage ? updatedPage.length : 0
        });
        return c.json({ error: 'Page not found or could not be updated' }, 404);
      }

      return c.json({
        message: 'Description regenerated successfully',
        description: newDescription
      });
    } catch (dbUpdateError) {
      console.error('Database update error:', {
        error: dbUpdateError,
        message: dbUpdateError instanceof Error ? dbUpdateError.message : String(dbUpdateError),
        stack: dbUpdateError instanceof Error ? dbUpdateError.stack : undefined,
        bookId,
        pageId
      });
      
      const errorMessage = dbUpdateError instanceof Error ? dbUpdateError.message : String(dbUpdateError);
      if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
        return c.json({ error: 'Network connection lost during update', details: errorMessage }, 503);
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return c.json({ error: 'Database update timed out', details: errorMessage }, 408);
      }
      
      return c.json({ error: 'Database update failed', details: errorMessage }, 500);
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

// Compare AI analysis with PDF text
books.post('/:bookId/compare-analysis', jwtMiddleware, async (c) => {
  try {
    const { bookId } = c.req.param();
    const user = c.get('user');
    
    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Verify book exists and user has permission
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    if (user.role !== 'admin' && book.uploaded_by !== user.userId) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Get all pages with text_content and image_description
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('id, page_number, text_content, image_description')
      .eq('book_id', bookId)
      .order('page_number');

    if (pagesError) {
      console.error('Failed to fetch book pages:', pagesError);
      return c.json({ error: 'Failed to fetch book pages' }, 500);
    }

    if (!pages || pages.length === 0) {
      return c.json({ error: 'No pages found for this book' }, 404);
    }

    const comparisons = [];
    let successfulComparisons = 0;
    let failedComparisons = 0;

    for (const page of pages) {
      if (!page.text_content || !page.image_description) {
        comparisons.push({
          page_number: page.page_number,
          report: 'Missing text or description for comparison'
        });
        failedComparisons++;
        continue;
      }

      try {
        // Use OpenAI for comparison
        const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: c.env.OPENAI_MODEL || 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are an educational assistant. Compare the PDF text with the AI-generated image description for accuracy, completeness, and educational value. Provide a brief report on consistency, any discrepancies, missing details, or suggestions for improvement. Keep it concise.'
              },
              {
                role: 'user',
                content: `PDF text: "${page.text_content}"\n\nAI image description: "${page.image_description}"\n\nComparison report:`
              }
            ],
            max_tokens: 200,
            temperature: 0.3
          }),
          signal: AbortSignal.timeout(30000)
        });

        if (response.ok) {
          const result = await response.json() as OpenAIResponse;
          const report = result.choices[0]?.message?.content || 'No report generated';
          comparisons.push({
            page_number: page.page_number,
            report
          });
          successfulComparisons++;
        } else {
          comparisons.push({
            page_number: page.page_number,
            report: 'Comparison API failed'
          });
          failedComparisons++;
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        comparisons.push({
          page_number: page.page_number,
          report: 'Comparison error: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
        failedComparisons++;
      }
    }

    return c.json({
      message: `Comparison completed for ${pages.length} pages`,
      results: {
        total_pages: pages.length,
        successful_comparisons: successfulComparisons,
        failed_comparisons: failedComparisons,
        comparisons
      }
    });
  } catch (error) {
    console.error('Compare analysis error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default books;
