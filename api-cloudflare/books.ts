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
const DEFAULT_OPENAI_VISION_TIMEOUT_MS = 120_000; // 120 seconds to handle complex image processing
const OPENAI_RETRY_ATTEMPTS = 1; // Reduced retry attempts since we increased timeout per attempt

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
type OpenAIContentPart = string | {
  type: string;
  text?: string;
  [key: string]: unknown;
};

type OpenAIContent = string | OpenAIContentPart[];

interface OpenAIMessage {
  role: string;
  content: OpenAIContent;
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
    OPENAI_GLOSSARY_TIMEOUT_MS?: string;
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

type GlossaryBoundingBox = {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
};

type GlossaryPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type GlossaryDuplicateMeaning = {
  definition: string;
  translation: string;
  pronunciation?: string | null;
  example_sentence?: string | null;
  notes?: string | null;
};

type GlossaryAnalysisEntry = {
  word: string;
  definition: string;
  translation: string;
  pronunciation?: string | null;
  example_sentence?: string | null;
  bounding_box?: GlossaryBoundingBox;
  notes?: string;
  position?: GlossaryPosition;
  duplicate_meanings?: GlossaryDuplicateMeaning[];
  metadata?: Record<string, unknown>;
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

books.get('/:bookId{[0-9a-fA-F-]+}', async (c) => {
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
    const supabase = createSupabaseClient(c.env);
    const bookId = c.req.query('book_id');
    const difficultyLevel = c.req.query('difficulty_level') ?? c.req.query('difficulty');
    const category = c.req.query('category');
    const search = c.req.query('search');
    const page = parseNumberParam(c.req.query('page'), 1);
    const limit = parseNumberParam(c.req.query('limit'), 20);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('vocabulary_words')
      .select('*');

    if (bookId) {
      query = query.eq('book_id', bookId);
    }

    if (difficultyLevel) {
      query = query.eq('difficulty_level', difficultyLevel);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      const trimmed = search.replace('%', '').trim();
      if (trimmed) {
        query = query.or(`word.ilike.%${trimmed}%,definition.ilike.%${trimmed}%`);
      }
    }

    const { data, error } = await query
      .order('word', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to fetch vocabulary', error, {
        difficultyLevel,
        category,
        search,
        page,
        limit
      });
      return c.json({ error: 'Failed to fetch vocabulary' }, 500);
    }

    const words = data ?? [];

    return c.json({
      vocabulary: words,
      words,
      page,
      limit
    });
  } catch (error) {
    logger.error('Error in get vocabulary', error);
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
    const page = parseNumberParam(c.req.query('page'), 1);
    const limit = parseNumberParam(c.req.query('limit'), 20);
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient(c.env);

    let query = supabase
      .from('book_discussions')
      .select(`
        *,
        books (
          id,
          title
        )
      `)
      .eq('user_id', payload.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (bookId) {
      query = query.eq('book_id', bookId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch discussions', error, {
        userId: payload.userId,
        bookId,
        page,
        limit
      });
      return c.json({ error: 'Failed to fetch discussions' }, 500);
    }

    return c.json({
      discussions: data ?? [],
      page,
      limit
    });
  } catch (error) {
    logger.error('Error in get discussions', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

books.get('/pages/:pageId/glossary', async (c) => {
  try {
    const { pageId } = c.req.param();

    if (!pageId) {
      return c.json({ error: 'Page ID is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('page_glossary_entries')
      .select('*')
      .eq('page_id', pageId)
      .order('word', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to fetch page glossary entries', error, { pageId });
      return c.json({ error: 'Failed to fetch glossary entries' }, 500);
    }

    const entries = Array.isArray(data) ? prepareGlossaryResponseEntries(data) : [];

    return c.json({ entries });
  } catch (error) {
    logger.error('Unexpected glossary fetch error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

books.post('/pages/:pageId/glossary/analyze', jwtMiddleware, async (c) => {
  try {
    const { pageId } = c.req.param();

    if (!pageId) {
      return c.json({ error: 'Page ID is required' }, 400);
    }

    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!['parent', 'admin'].includes(user.role)) {
      return c.json({ error: 'Only parents or admins can generate glossary entries' }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      body = {};
    }

    const maxEntriesRaw =
      typeof body.max_entries === 'number'
        ? body.max_entries
        : Number.parseInt(String(body.max_entries ?? ''), 10);

    const maxEntries = Number.isFinite(maxEntriesRaw) && maxEntriesRaw > 0
      ? Math.min(maxEntriesRaw, 15)
      : 6;

    const refresh = body.refresh === undefined ? true : Boolean(body.refresh);

    const supabase = createSupabaseClient(c.env);

    const { data: page, error: pageError } = await supabase
      .from('book_pages')
      .select('id, book_id, page_number, image_url, text_content')
      .eq('id', pageId)
      .single();

    if (pageError || !page) {
      return c.json({ error: 'Book page not found' }, 404);
    }

    if (!page.image_url) {
      return c.json({ error: 'Page is missing an image to analyze' }, 400);
    }

    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, difficulty_level, target_age_min, target_age_max')
      .eq('id', page.book_id)
      .single();

    if (bookError || !book) {
      return c.json({ error: 'Book not found for the requested page' }, 404);
    }

    let aiEntries: GlossaryAnalysisEntry[] = [];

    const openAiAvailable = Boolean(
      c.env.OPENAI_API_KEY &&
      c.env.OPENAI_API_KEY !== 'your-openai-api-key-here' &&
      c.env.OPENAI_API_KEY.length >= 10
    );

    const inlineImageUrl = openAiAvailable ? await getInlineImageUrl(page.image_url) : null;
    const imageSource = inlineImageUrl ?? page.image_url;

    const metadata: Record<string, unknown> = {
      book_title: book.title,
      page_number: page.page_number,
      inline_image_used: Boolean(inlineImageUrl),
      requester_role: user.role,
      glossary_max_entries: maxEntries
    };

    if (openAiAvailable) {
      const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const controller = new AbortController();
      const visionTimeoutRaw = c.env.OPENAI_VISION_TIMEOUT_MS;
      const glossaryTimeoutRaw = c.env.OPENAI_GLOSSARY_TIMEOUT_MS;
      const parsedTimeout = visionTimeoutRaw ? Number.parseInt(visionTimeoutRaw, 10) : Number.NaN;
      const parsedGlossaryTimeout = glossaryTimeoutRaw ? Number.parseInt(glossaryTimeoutRaw, 10) : Number.NaN;
      const baseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_OPENAI_VISION_TIMEOUT_MS;
      const glossaryTimeoutMs = Number.isFinite(parsedGlossaryTimeout) && parsedGlossaryTimeout > 0 ? parsedGlossaryTimeout : 300_000;
      const timeoutMs = Math.max(baseTimeoutMs, glossaryTimeoutMs);
      metadata.glossary_timeout_ms = timeoutMs;

      const visionModel = c.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
      metadata.openai_model = visionModel;

      const promptInstruction = `You are assisting a parent who supports an English learner at the primary school level. ` +
        `Analyze the provided book page image and identify up to ${maxEntries} English words or short phrases that a primary school student might find challenging. ` +
        `Respond with a single JSON object matching this schema: { "entries": [ { "word": string, "definition": string, ` +
        `"translation": string, "pronunciation": string, "example_sentence": string, "bounding_box": { "top": number, "left": number, "width": number, "height": number }, ` +
        `"notes"?: string, "duplicate_meanings"?: [ { "definition": string, "translation": string, "pronunciation"?: string, "example_sentence"?: string, "notes"?: string } ] } ] }. ` +
        `If you encounter multiple meanings for the same word, include the additional meanings inside duplicate_meanings for that entry so they appear after the primary meaning. ` +
        `IMPORTANT: All bounding_box coordinates must be normalized between 0 and 1 relative to the image dimensions. ` +
        `For example, if a word is at the top-left corner, use top: 0, left: 0. If at bottom-right, use top: 0.9, left: 0.9. ` +
        `Width and height should also be normalized (e.g., width: 0.1 means 10% of image width). ` +
        `All floating point numbers must use a dot decimal (.) and at most three decimals. Do not include any explanatory text before or after the JSON.`;

      const messages = [
        {
          role: 'system',
          content: 'You are an expert children\'s reading coach and bilingual assistant.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptInstruction },
            {
              type: 'text',
              text: `Book: ${book.title}. Difficulty: ${book.difficulty_level}. Target age: ${book.target_age_min}-${book.target_age_max}. Page: ${page.page_number}.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageSource,
                detail: inlineImageUrl ? undefined : 'high'
              }
            }
          ]
        }
      ];

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const startTime = Date.now();

      try {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: visionModel,
            messages,
            max_tokens: 1500,
            temperature: 0.2,
            response_format: {
              type: 'json_object'
            }
          }),
          signal: controller.signal
        });

        const elapsed = Date.now() - startTime;
        metadata.api_duration_ms = elapsed;
        metadata.openai_status = response.status;

        if (!response.ok) {
          const errorText = await response.text();
          metadata.api_error = true;
          logger.error('OpenAI glossary analysis error', errorText, { pageId, status: response.status });
        } else {
          const result = await response.json() as OpenAIResponse;
          const message = result.choices?.[0]?.message ?? null;
          let structuredPayload: unknown = null;

          const rawContent = message ? coerceOpenAIContent(message.content) : '';

          if (rawContent) {
            const content = rawContent.trim();
            metadata.response_characters = content.length;

            if (!content.endsWith('}') && !content.endsWith(']}')) {
              metadata.incomplete_response = true;
            }

            try {
              structuredPayload = JSON.parse(content);
            } catch {
              const cleanedContent = content.replace(/```json|```/g, '').trim();

              try {
                structuredPayload = JSON.parse(cleanedContent);
              } catch {
                const repaired = attemptRepairJsonResponse(cleanedContent);
                if (repaired) {
                  structuredPayload = JSON.parse(repaired);
                  metadata.repaired_response = true;
                } else {
                  metadata.json_parse_error = true;
                }
              }
            }
          } else {
            metadata.no_content = true;
            logger.info('No message content received from AI response', { pageId });
          }

          const maybeEntries = structuredPayload && Array.isArray((structuredPayload as any).entries)
            ? (structuredPayload as any).entries
            : Array.isArray(structuredPayload)
              ? structuredPayload
              : [];

          if (Array.isArray(maybeEntries) && maybeEntries.length > 0) {
            aiEntries = maybeEntries
              .map((entry: any) => {
                const metadata = isRecord(entry?.metadata) ? entry.metadata : undefined;
                const duplicateMeaningsSource = entry?.duplicate_meanings ?? metadata?.duplicate_meanings;
                const duplicate_meanings = normalizeDuplicateMeanings(duplicateMeaningsSource);
                const pronunciation = typeof entry?.pronunciation === 'string' ? entry.pronunciation.trim() : null;
                const example_sentence = typeof entry?.example_sentence === 'string' ? entry.example_sentence.trim() : null;

                return {
                  word: typeof entry?.word === 'string' ? entry.word.trim() : '',
                  definition: typeof entry?.definition === 'string' ? entry.definition.trim() : '',
                  translation: typeof entry?.translation === 'string' ? entry.translation.trim() : '',
                  pronunciation,
                  example_sentence,
                  bounding_box: entry?.bounding_box,
                  notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
                  duplicate_meanings: duplicate_meanings.length ? duplicate_meanings : undefined,
                  metadata
                } as GlossaryAnalysisEntry;
              })
              .filter(entry => entry.word && entry.definition && entry.translation);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          metadata.timeout_occurred = true;
          logger.warn('Glossary analysis request aborted due to timeout', { pageId, timeoutMs });
        } else {
          metadata.request_error = error instanceof Error ? error.message : String(error);
          logger.error('Glossary analysis request failed', error, { pageId });
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } else {
      metadata.ai_disabled = true;
    }

    if (aiEntries.length) {
      aiEntries = mergeDuplicateEntries(aiEntries);
    }

    if (!aiEntries.length) {
      const fallbackEntries = generateFallbackGlossaryFromText(page.text_content, maxEntries);
      aiEntries = mergeDuplicateEntries(fallbackEntries);
      metadata.fallback_used = true;
    }

    if (!aiEntries.length) {
      return c.json({ message: 'No glossary entries identified', entries: [] });
    }

    if (refresh) {
      const { error: deleteError } = await supabase
        .from('page_glossary_entries')
        .delete()
        .eq('page_id', pageId);

      if (deleteError) {
        logger.error('Failed to clear previous glossary entries', deleteError, { pageId });
      }
    }

    const mappedEntries = aiEntries.slice(0, maxEntries).map((entry, index) => {
      const fallbackPosition = createFallbackPosition(index, aiEntries.length);
      const basePosition = entry.position ?? fallbackPosition;

      const normalizedPosition = entry.bounding_box
        ? {
            top: Math.max(0, Math.min(1, typeof entry.bounding_box.top === 'number' ? entry.bounding_box.top : basePosition.top)),
            left: Math.max(0, Math.min(1, typeof entry.bounding_box.left === 'number' ? entry.bounding_box.left : basePosition.left)),
            width: Math.max(0.04, Math.min(1, typeof entry.bounding_box.width === 'number' ? entry.bounding_box.width : 0.18)),
            height: Math.max(0.04, Math.min(1, typeof entry.bounding_box.height === 'number' ? entry.bounding_box.height : 0.1))
          }
        : basePosition;

      logger.info('Glossary entry position normalized', {
        pageId,
        word: entry.word,
        normalizedPosition,
        rawBoundingBox: entry.bounding_box ?? null
      });

      const sourceFromMetadata = isRecord(entry.metadata) && typeof entry.metadata['source'] === 'string'
        ? (entry.metadata['source'] as string)
        : undefined;

      const source = sourceFromMetadata
        ?? (metadata.fallback_used === true || !openAiAvailable ? 'fallback-text' : 'openai-vision');

      const metadataPayload = composeEntryMetadata(
        {
          ...metadata
        },
        entry,
        source
      );

      return {
        page_id: pageId,
        word: entry.word,
        definition: entry.definition,
        translation: entry.translation,
        difficulty: null,
        confidence: null,
        position: normalizedPosition,
        metadata: metadataPayload,
        created_by: user.userId
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('page_glossary_entries')
      .insert(mappedEntries)
      .select('*');

    if (insertError) {
      logger.error('Failed to store glossary entries', insertError, { pageId });
      return c.json({ error: 'Failed to store glossary entries' }, 500);
    }

    const responseEntries = Array.isArray(inserted) ? prepareGlossaryResponseEntries(inserted) : [];

    return c.json({
      message: 'Glossary generated successfully',
      entries: responseEntries,
      used_fallback: metadata.fallback_used === true,
      total: responseEntries.length
    });
  } catch (error) {
    logger.error('Unexpected glossary analysis error', error, { pageId: c.req.param('pageId') });
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

const clamp01 = (value: unknown, fallback = 0): number => {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (num < 0) return 0;
  if (num > 1) return 1;
  return Number(num.toFixed(4));
};

const createFallbackPosition = (index: number, total: number) => {
  if (total <= 0) {
    return { top: 0.1, left: 0.1, width: 0.2, height: 0.1 };
  }

  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;

  const width = 0.18;
  const height = 0.1;

  const horizontalGap = columns > 1 ? (1 - width) / (columns - 1 || 1) : 0;
  const verticalGap = rows > 1 ? (1 - height) / (rows - 1 || 1) : 0;

  const left = clamp01(column * horizontalGap);
  const top = clamp01(row * verticalGap + 0.05);

  return { top, left, width, height };
};

const generateFallbackGlossaryFromText = (text: string | null | undefined, maxEntries = 6): GlossaryAnalysisEntry[] => {
  if (!text) return [];

  const sanitized = text.toLowerCase().replace(/[^a-z\s-]/g, ' ');
  const words = sanitized.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const stopWords = new Set([
    'the', 'and', 'with', 'from', 'they', 'have', 'this', 'that', 'were', 'said',
    'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there', 'could',
    'other', 'more', 'very', 'what', 'know', 'just', 'into', 'over', 'also', 'your',
    'work', 'life', 'only', 'still', 'should', 'after', 'being', 'before', 'through',
    'when', 'where', 'some', 'then', 'them', 'well', 'once'
  ]);

  const candidates: string[] = [];
  for (const word of words) {
    if (word.length < 5) continue;
    if (stopWords.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    candidates.push(word);
    if (candidates.length >= maxEntries) break;
  }

  return candidates.map((word, index) => ({
    word,
    definition: `Definition for "${word}" is not available in offline mode.`,
    translation: `${word}（待翻译）`,
    pronunciation: null,
    example_sentence: null,
    position: createFallbackPosition(index, candidates.length),
    notes: 'Generated without AI vision OCR.',
    metadata: { source: 'fallback-text', note: 'Generated without AI vision OCR' }
  }));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeDuplicateMeanings = (value: unknown): GlossaryDuplicateMeaning[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (!isRecord(item)) return null;

      const definition = typeof item.definition === 'string' ? item.definition.trim() : '';
      const translation = typeof item.translation === 'string' ? item.translation.trim() : '';
      const pronunciation = typeof item.pronunciation === 'string' ? item.pronunciation.trim() : null;
      const example_sentence = typeof item.example_sentence === 'string' ? item.example_sentence.trim() : null;
      const notes = typeof item.notes === 'string' ? item.notes.trim() : null;

      if (!definition && !translation) {
        return null;
      }

      const duplicate: GlossaryDuplicateMeaning = {
        definition,
        translation,
        pronunciation,
        example_sentence,
        notes
      };

      return duplicate;
    })
    .filter((entry): entry is GlossaryDuplicateMeaning => entry !== null);
};

const mergeDuplicateEntries = (entries: GlossaryAnalysisEntry[]): GlossaryAnalysisEntry[] => {
  const seen = new Map<string, GlossaryAnalysisEntry>();
  const ordered: GlossaryAnalysisEntry[] = [];

  const mergeBoundingBox = (current: GlossaryBoundingBox | undefined, incoming: GlossaryBoundingBox | undefined) => {
    if (!incoming) return current;
    if (!current) return { ...incoming };

    const merged: GlossaryBoundingBox = { ...current };
    for (const key of ['top', 'left', 'width', 'height'] as const) {
      const currentValue = typeof merged[key] === 'number' ? merged[key] : undefined;
      const incomingValue = typeof incoming[key] === 'number' ? incoming[key] : undefined;
      if (incomingValue !== undefined && currentValue === undefined) {
        merged[key] = incomingValue;
      }
    }
    return merged;
  };

  for (const entry of entries) {
    const key = typeof entry.word === 'string' ? entry.word.trim().toLowerCase() : '';

    if (!key) {
      ordered.push(entry);
      continue;
    }

    const existing = seen.get(key);

    if (!existing) {
      const normalizedDuplicates = entry.duplicate_meanings
        ? normalizeDuplicateMeanings(entry.duplicate_meanings)
        : [];

      const initialEntry: GlossaryAnalysisEntry = {
        ...entry,
        duplicate_meanings: normalizedDuplicates.length ? normalizedDuplicates : undefined
      };

      seen.set(key, initialEntry);
      ordered.push(initialEntry);
      continue;
    }

    const duplicates = existing.duplicate_meanings ?? [];
    duplicates.push({
      definition: entry.definition,
      translation: entry.translation,
      pronunciation: entry.pronunciation ?? null,
      example_sentence: entry.example_sentence ?? null,
      notes: entry.notes ?? null
    });

    existing.duplicate_meanings = duplicates;

    if (!existing.pronunciation && entry.pronunciation) {
      existing.pronunciation = entry.pronunciation;
    }

    if (!existing.example_sentence && entry.example_sentence) {
      existing.example_sentence = entry.example_sentence;
    }

    if (!existing.notes && entry.notes) {
      existing.notes = entry.notes;
    }

    existing.bounding_box = mergeBoundingBox(existing.bounding_box, entry.bounding_box);

    if (!existing.position && entry.position) {
      existing.position = entry.position;
    }

    if (entry.metadata) {
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...entry.metadata
      };
    }
  }

  return ordered;
};

const composeEntryMetadata = (
  baseMetadata: Record<string, unknown>,
  entry: GlossaryAnalysisEntry,
  source: string
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    ...baseMetadata,
    ...(entry.metadata ?? {})
  };

  if (typeof entry.notes === 'string') {
    const trimmed = entry.notes.trim();
    if (trimmed) {
      payload.notes = trimmed;
    } else if (typeof payload.notes === 'string' && !payload.notes.trim()) {
      delete payload.notes;
    }
  } else if (typeof payload.notes === 'string') {
    const trimmed = payload.notes.trim();
    if (trimmed) {
      payload.notes = trimmed;
    } else {
      delete payload.notes;
    }
  }

  if (typeof entry.pronunciation === 'string' && entry.pronunciation.trim()) {
    payload.pronunciation = entry.pronunciation.trim();
  } else if (typeof payload.pronunciation === 'string') {
    const trimmed = payload.pronunciation.trim();
    if (trimmed) {
      payload.pronunciation = trimmed;
    } else {
      delete payload.pronunciation;
    }
  }

  if (typeof entry.example_sentence === 'string' && entry.example_sentence.trim()) {
    payload.example_sentence = entry.example_sentence.trim();
  } else if (typeof payload.example_sentence === 'string') {
    const trimmed = payload.example_sentence.trim();
    if (trimmed) {
      payload.example_sentence = trimmed;
    } else {
      delete payload.example_sentence;
    }
  }

  payload.source = source;
  payload.raw_bounding_box = entry.bounding_box ?? null;

  if (entry.duplicate_meanings && entry.duplicate_meanings.length > 0) {
    payload.duplicate_meanings = entry.duplicate_meanings;
  } else if ('duplicate_meanings' in payload) {
    const duplicates = payload.duplicate_meanings;
    if (!Array.isArray(duplicates) || duplicates.length === 0) {
      delete payload.duplicate_meanings;
    }
  }

  return payload;
};

const transformStoredGlossaryEntry = (entry: Record<string, any>) => {
  const {
    metadata,
    difficulty: _difficulty,
    confidence: _confidence,
    ...rest
  } = entry;

  const metadataRecord = isRecord(metadata) ? metadata : {};

  const pronunciation = typeof metadataRecord.pronunciation === 'string'
    ? metadataRecord.pronunciation
    : null;
  const example_sentence = typeof metadataRecord.example_sentence === 'string'
    ? metadataRecord.example_sentence
    : null;
  const notes = typeof metadataRecord.notes === 'string'
    ? metadataRecord.notes
    : undefined;
  const duplicate_meanings = normalizeDuplicateMeanings(metadataRecord.duplicate_meanings);

  const metadataForResponse: Record<string, unknown> = { ...metadataRecord };
  delete metadataForResponse.pronunciation;
  delete metadataForResponse.example_sentence;
  delete metadataForResponse.duplicate_meanings;

  if (notes !== undefined) {
    metadataForResponse.notes = notes;
  } else {
    delete metadataForResponse.notes;
  }

  const cleanedMetadata = Object.keys(metadataForResponse).length > 0 ? metadataForResponse : null;

  return {
    ...rest,
    pronunciation,
    example_sentence,
    duplicate_meanings,
    notes,
    metadata: cleanedMetadata
  };
};

const prepareGlossaryResponseEntries = (entries: Record<string, any>[]) =>
  entries.map(transformStoredGlossaryEntry);

const attemptRepairJsonResponse = (rawContent: string): string | null => {
  if (!rawContent) return null;

  let candidate = rawContent.replace(/```json|```/g, '').trim();
  if (!candidate) return null;

  const lastClosingBrace = candidate.lastIndexOf('}');
  if (lastClosingBrace !== -1 && lastClosingBrace < candidate.length - 1) {
    candidate = candidate.slice(0, lastClosingBrace + 1);
  }

  candidate = candidate.replace(/\s+$/, '');

  const countMatches = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

  let openSquares = countMatches(candidate, /\[/g);
  let closeSquares = countMatches(candidate, /\]/g);
  let openCurlies = countMatches(candidate, /{/g);
  let closeCurlies = countMatches(candidate, /}/g);

  while (closeSquares < openSquares) {
    candidate += ']';
    closeSquares += 1;
  }

  while (closeCurlies < openCurlies) {
    candidate += '}';
    closeCurlies += 1;
  }

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
};

const coerceOpenAIContent = (content: OpenAIContent | undefined): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
};

// POST /analyze-image - Analyze image and extract description and vocabulary
books.post('/analyze-image', jwtMiddleware, async (c) => {

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

    const openaiVisionModel = c.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
    const inlineImageUrl = await getInlineImageUrl(image_url);
    const openaiImageSource = inlineImageUrl ?? image_url;

    // Retry logic for OpenAI API calls
    const makeOpenAIRequest = async (attempt: number): Promise<Response> => {
      const controller = new AbortController();
      const requestStartTime = Date.now();
      
      const requestTimeoutId = setTimeout(() => {
        const elapsed = Date.now() - requestStartTime;
        logger.warn('AI Vision API timeout triggered - request taking longer than expected', { 
          elapsed, 
          timeoutMs, 
          image_url, 
          attempt: attempt + 1,
          maxAttempts: OPENAI_RETRY_ATTEMPTS + 1,
          message: `Request exceeded ${timeoutMs/1000}s timeout, falling back to basic description`
        });
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(apiUrl, {
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
                 content: 'You are an educational assistant for children learning English. Provide a comprehensive, detailed, and complete description for this book page. Include all visible text, characters, objects, actions, and educational content. Do not truncate your response.'
               },
               {
                 role: 'user',
                 content: [
                   {
                     type: 'text',
                     text: 'Please provide a complete and comprehensive description of this children\'s book page. Include ALL visible text, characters, actions, setting, educational details, and any other content you can see. Make sure to describe everything thoroughly without cutting off your response.'
                   },
                  {
                    type: 'image_url',
                    image_url: {
                      url: openaiImageSource,
                      detail: 'low' // Use low detail for faster processing
                    }
                  }
                ]
              }
            ],
            max_tokens: 1024, // Allow for detailed descriptions without truncation
            temperature: 0.2  // Lower temperature for more consistent, faster responses
          }),
          signal: controller.signal
        });

        clearTimeout(requestTimeoutId);
        return response;
      } catch (error) {
        clearTimeout(requestTimeoutId);
        throw error;
      }
    };

    let lastError: Error | null = null;
    const startTime = Date.now();

    // Try the request with retries
    for (let attempt = 0; attempt <= OPENAI_RETRY_ATTEMPTS; attempt++) {
      try {
        const openaiResponse = await makeOpenAIRequest(attempt);

        const elapsed = Date.now() - startTime;
        logger.info('OpenAI Vision API request completed', { 
          elapsed, 
          image_url, 
          attempt: attempt + 1,
          success: true 
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          logger.warn('OpenAI Vision API returned non-200 response', { 
            status: openaiResponse.status,
            statusText: openaiResponse.statusText,
            error: errorText,
            attempt: attempt + 1
          });
          
          // If it's a rate limit (429) or server error (5xx), retry
          if ((openaiResponse.status === 429 || openaiResponse.status >= 500) && attempt < OPENAI_RETRY_ATTEMPTS) {
            lastError = new Error(`OpenAI API error ${openaiResponse.status}: ${errorText}`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
            continue;
          }
          
          ensureFallback(`OpenAI Vision API returned ${openaiResponse.status} response.`);
          break;
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
            if (attempt < OPENAI_RETRY_ATTEMPTS) {
              lastError = new Error('OpenAI Vision response missing content');
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
              continue;
            }
            ensureFallback('OpenAI Vision response missing content.');
          } else {
            analysisResult = {
              description: cleanedContent,
              vocabulary: []
            };
            break; // Success, exit retry loop
          }
        }
      } catch (error) {
        const elapsed = Date.now() - startTime;
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('OpenAI Vision API request failed', { 
          elapsed, 
          image_url, 
          attempt: attempt + 1,
          maxAttempts: OPENAI_RETRY_ATTEMPTS + 1,
          error: lastError.message 
        });

        // Don't retry on timeout errors (AbortError) since we increased the timeout
        // Only retry on network errors or other transient issues
        if (attempt >= OPENAI_RETRY_ATTEMPTS || 
            lastError.name === 'AbortError' || 
            lastError.message.includes('timeout') ||
            lastError.message.includes('aborted')) {
          break;
        }

        // Wait before retrying (exponential backoff) - only for non-timeout errors
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 2000)); // Increased backoff
      }
    }

    // If we exhausted all retries, use fallback
    if (!analysisResult && lastError) {
      logger.error('OpenAI Vision API request failed after all retries', {
        error: lastError.message,
        attempts: OPENAI_RETRY_ATTEMPTS + 1,
        image_url
      });
      ensureFallback(`OpenAI Vision API request failed: ${lastError.message}`);
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
              max_tokens: 800,
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

        const descriptionRaw = coerceOpenAIContent(analysisResult.choices[0]?.message?.content);
        const description = descriptionRaw.trim();
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
              const aiContent = coerceOpenAIContent(openaiResult.choices[0].message.content);
              const trimmed = aiContent.trim();
              if (trimmed) {
                newDescription = trimmed;
              }
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
            const aiContent = coerceOpenAIContent(openaiResult.choices[0].message.content);
            const trimmed = aiContent.trim();
            if (trimmed) {
              newDescription = trimmed;
            }
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
          const rawReport = coerceOpenAIContent(result.choices[0]?.message?.content);
          const report = rawReport.trim() || 'No report generated';
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
