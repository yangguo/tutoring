/**
 * Books API routes for the Interactive English Tutor
 * Handle book management, reading sessions, and vocabulary
 */
import { Router, type Request, type Response } from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { authenticateToken, requireRole, requireChildAccess } from '../utils/jwt';

const router = Router();

// Validation schemas
const readingSessionSchema = Joi.object({
  book_id: Joi.string().uuid().required(),
  pages_read: Joi.array().items(Joi.number().positive()).required(),
  time_spent: Joi.number().positive().required(),
  comprehension_score: Joi.number().min(0).max(100).optional(),
  vocabulary_learned: Joi.array().items(Joi.string().uuid()).optional()
});

const speakingSessionSchema = Joi.object({
  book_id: Joi.string().uuid().required(),
  page_number: Joi.number().positive().required(),
  text_content: Joi.string().required(),
  audio_url: Joi.string().uri().optional(),
  pronunciation_score: Joi.number().min(0).max(100).optional(),
  fluency_score: Joi.number().min(0).max(100).optional(),
  accuracy_score: Joi.number().min(0).max(100).optional()
});

/**
 * Get all public books with optional filters
 * GET /api/books
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 12,
      difficulty,
      category,
      target_age,
      search
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const offset = (pageNum - 1) * limitNum;

    // Get user ID from token if available
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.userId;
      } catch (error) {
        // Token invalid or expired, continue without user context
      }
    }

    // Build query - show public books OR user's own books
    let query = supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter for public books OR user's own books
    if (userId) {
      query = query.or(`is_public.eq.true,uploaded_by.eq.${userId}`);
    } else {
      query = query.eq('is_public', true);
    }

    // Apply filters
    if (difficulty) {
      query = query.eq('difficulty_level', difficulty);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (target_age) {
      const age = parseInt(target_age as string);
      query = query
        .lte('target_age_min', age)
        .gte('target_age_max', age);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: books, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      res.status(500).json({ error: 'Failed to fetch books' });
      return;
    }

    res.json({
      books: books || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get Book by ID with Pages
 * GET /api/books/:bookId
 */
router.get('/:bookId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;

    // Try to identify user (optional)
    let userId: string | null = null;
    let role: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.userId;
        role = decoded.role;
      } catch (e) {
        // ignore invalid tokens and continue as unauthenticated
      }
    }

    // Get book regardless of visibility first
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    // Access control: allow if public, admin, owner, or assigned via a lesson
    let allowed = !!book.is_public;
    if (!allowed && role === 'admin') allowed = true;
    if (!allowed && userId && book.uploaded_by === userId) allowed = true;
    if (!allowed && userId) {
      const { data: lessons } = await supabase
        .from('lesson_plans')
        .select('id')
        .contains('assigned_students', [userId])
        .contains('book_ids', [bookId])
        .limit(1);
      if (lessons && lessons.length > 0) allowed = true;
    }

    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get book pages
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('*')
      .eq('book_id', bookId)
      .order('page_number', { ascending: true });

    if (pagesError) {
      res.status(500).json({ error: 'Failed to fetch book pages' });
      return;
    }

    res.json({
      book: {
        ...book,
        pages: pages || []
      }
    });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Start Reading Session
 * POST /api/books/reading-session
 */
router.post('/reading-session', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError, value } = readingSessionSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { userId } = (req as any).user;
    const { book_id, pages_read, time_spent, comprehension_score, vocabulary_learned } = value;

    // Verify book exists
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id')
      .eq('id', book_id)
      .eq('is_public', true)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    // Create reading session
    const { data: sessionData, error: sessionError } = await supabase
      .from('reading_sessions')
      .insert({
        user_id: userId,
        book_id,
        pages_read,
        time_spent,
        comprehension_score,
        vocabulary_learned
      })
      .select()
      .single();

    if (sessionError) {
      res.status(500).json({ error: 'Failed to create speaking session' });
      return;
    }

    res.status(201).json({
      message: 'Speaking session created successfully',
      session: {
        id: sessionData.id,
        book_id: sessionData.book_id,
        page_number: sessionData.page_number,
        pronunciation_score: sessionData.pronunciation_score,
        fluency_score: sessionData.fluency_score,
        accuracy_score: sessionData.accuracy_score,
        created_at: sessionData.created_at
      }
    });
  } catch (error) {
    console.error('Create speaking session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get User's Reading Progress
 * GET /api/books/progress
 */
router.get('/progress', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id } = req.query;

    let query = supabase
      .from('user_progress')
      .select(`
        *,
        books (
          id,
          title,
          difficulty_level,
          target_age_min,
          target_age_max
        )
      `)
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: progress, error } = await query.order('last_read_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch progress' });
      return;
    }

    res.json({ progress: progress || [] });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get User's Reading Sessions
 * GET /api/books/reading-sessions
 */
router.get('/reading-sessions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('reading_sessions')
      .select(`
        *,
        books (
          id,
          title
        )
      `)
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: sessions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch reading sessions' });
      return;
    }

    res.json({
      sessions: sessions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get reading sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get User's Speaking Sessions
 * GET /api/books/speaking-sessions
 */
router.get('/speaking-sessions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('speaking_sessions')
      .select(`
        *,
        books (
          id,
          title
        )
      `)
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: sessions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch speaking sessions' });
      return;
    }

    res.json({
      sessions: sessions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get speaking sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get Vocabulary Words
 * GET /api/books/vocabulary
 */
router.get('/vocabulary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { difficulty_level, search, page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('vocabulary_words')
      .select('*');

    if (difficulty_level) {
      query = query.eq('difficulty_level', difficulty_level);
    }

    if (search) {
      query = query.or(`word.ilike.%${search}%,definition.ilike.%${search}%`);
    }

    const { data: vocabulary, error } = await query
      .order('word', { ascending: true })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch vocabulary' });
      return;
    }

    res.json({
      vocabulary: vocabulary || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Add Word to User Vocabulary
 * POST /api/books/vocabulary/learn
 */
router.post('/vocabulary/learn', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { word_id } = req.body;

    if (!word_id) {
      res.status(400).json({ error: 'Word ID is required' });
      return;
    }

    // Check if word exists
    const { data: word, error: wordError } = await supabase
      .from('vocabulary_words')
      .select('id')
      .eq('id', word_id)
      .single();

    if (wordError || !word) {
      res.status(404).json({ error: 'Vocabulary word not found' });
      return;
    }

    // Check if already learned
    const { data: existing } = await supabase
      .from('user_vocabulary')
      .select('id')
      .eq('user_id', userId)
      .eq('word_id', word_id)
      .single();

    if (existing) {
      res.status(409).json({ error: 'Word already in user vocabulary' });
      return;
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
      res.status(500).json({ error: 'Failed to add word to vocabulary' });
      return;
    }

    res.status(201).json({
      message: 'Word added to vocabulary successfully',
      user_vocabulary: {
        id: userVocab.id,
        word_id: userVocab.word_id,
        mastery_level: userVocab.mastery_level,
        learned_at: userVocab.learned_at
      }
    });
  } catch (error) {
    console.error('Learn vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get User's Learned Vocabulary
 * GET /api/books/vocabulary/learned
 */
router.get('/vocabulary/learned', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    const { data: learnedWords, error } = await supabase
      .from('user_vocabulary')
      .select(`
        *,
        vocabulary_words (
          id,
          word,
          definition,
          pronunciation,
          example_sentence,
          difficulty_level
        )
      `)
      .eq('user_id', userId)
      .order('learned_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch learned vocabulary' });
      return;
    }

    res.json({
      learned_words: learnedWords || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get learned vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Evaluate Pronunciation using OpenAI
 * POST /api/books/evaluate-pronunciation
 */
router.post('/evaluate-pronunciation', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { transcript, targetText, confidence } = req.body;

    if (!transcript || !targetText) {
      res.status(400).json({ error: 'Transcript and target text are required' });
      return;
    }

    // Enhanced pronunciation evaluation using OpenAI
    let openaiResponse;
    try {
      // Check if OpenAI configuration is available and valid
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing or invalid, falling back to basic evaluation');
        const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
        res.json(basicEvaluation);
        return;
      }

      openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an English pronunciation tutor. Analyze the spoken text compared to the target text and provide detailed feedback. Return a JSON response with pronunciation_score (0-100), fluency_score (0-100), accuracy_score (0-100), and suggestions array.'
            },
            {
              role: 'user',
              content: `Target text: "${targetText}"\nSpoken text: "${transcript}"\nSpeech recognition confidence: ${confidence || 0.8}\n\nPlease evaluate the pronunciation, fluency, and accuracy. Provide specific suggestions for improvement.`
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        }),
        timeout: 10000 // 10 second timeout
      });
    } catch (fetchError) {
      console.error('OpenAI API fetch error:', fetchError);
      // Fallback to basic evaluation on network error
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
      return;
    }

    if (!openaiResponse.ok) {
      console.error('OpenAI API error:', await openaiResponse.text());
      // Fallback to basic evaluation
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
      return;
    }

    const openaiResult = await openaiResponse.json();
    const aiContent = openaiResult.choices[0]?.message?.content;

    try {
      const evaluation = JSON.parse(aiContent);
      res.json({
        pronunciation_score: Math.min(100, Math.max(0, evaluation.pronunciation_score || 70)),
        fluency_score: Math.min(100, Math.max(0, evaluation.fluency_score || 70)),
        accuracy_score: Math.min(100, Math.max(0, evaluation.accuracy_score || 70)),
        suggestions: evaluation.suggestions || ['Keep practicing to improve your pronunciation!']
      });
    } catch (parseError) {
      // Fallback to basic evaluation if AI response is not valid JSON
      const basicEvaluation = evaluateBasicPronunciation(transcript, targetText, confidence || 0.8);
      res.json(basicEvaluation);
    }
  } catch (error) {
    console.error('Pronunciation evaluation error:', error);
    // Fallback to basic evaluation
    const basicEvaluation = evaluateBasicPronunciation(req.body.transcript, req.body.targetText, req.body.confidence || 0.8);
    res.json(basicEvaluation);
  }
});

// Helper function for basic pronunciation evaluation
function evaluateBasicPronunciation(transcript: string, targetText: string, confidence: number) {
  const targetWords = targetText.toLowerCase().replace(/[.,!?;]/g, '').split(' ');
  const spokenWords = transcript.toLowerCase().replace(/[.,!?;]/g, '').split(' ');
  
  // Calculate accuracy based on word matching
  let correctWords = 0;
  const minLength = Math.min(spokenWords.length, targetWords.length);
  
  for (let i = 0; i < minLength; i++) {
    if (spokenWords[i] === targetWords[i]) {
      correctWords++;
    }
  }
  
  const accuracy = (correctWords / targetWords.length) * 100;
  const pronunciation = confidence * 100;
  const fluency = Math.max(0, 100 - Math.abs(spokenWords.length - targetWords.length) * 10);
  
  // Generate suggestions
  const suggestions = [];
  if (accuracy < 80) {
    suggestions.push('Try to pronounce each word clearly and distinctly');
  }
  if (pronunciation < 70) {
    suggestions.push('Speak more confidently and clearly');
  }
  if (fluency < 70) {
    suggestions.push('Try to match the rhythm and pace of natural speech');
  }
  if (suggestions.length === 0) {
    suggestions.push('Great job! Keep practicing to improve further.');
  }
  
  return {
    pronunciation_score: Math.round(pronunciation),
    fluency_score: Math.round(fluency),
    accuracy_score: Math.round(accuracy),
    suggestions
  };
}

/**
 * Analyze Image using OpenAI GPT-4 Vision
 * POST /api/books/analyze-image
 */
router.post('/analyze-image', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { image_url, page_id, context } = req.body;

    if (!image_url) {
      res.status(400).json({ error: 'Image URL is required' });
      return;
    }

    // Enhanced image analysis using OpenAI GPT-4 Vision
    let openaiResponse;
    try {
      // Check if OpenAI configuration is available and valid
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing or invalid, falling back to basic description');
        const basicDescription = generateBasicImageDescription(image_url, context);
        res.json({ description: basicDescription, vocabulary: [] });
        return;
      }

      openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'system',
              content: 'You are an educational assistant for children learning English. Analyze the image and provide an age-appropriate, educational description. Also extract 3-5 key vocabulary words that children can learn from this image. Return a JSON response with "description" (string) and "vocabulary" (array of objects with "word", "definition", and "difficulty_level" fields).'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Please analyze this image from a children's book. Context: ${context || 'General children\'s book illustration'}. Provide an educational description suitable for children aged 3-12, and identify key vocabulary words they can learn.`
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
          max_tokens: 800,
          temperature: 0.3
        }),
        timeout: 15000 // 15 second timeout for vision API
      });
    } catch (fetchError) {
      console.error('OpenAI Vision API fetch error:', fetchError);
      // Fallback to basic description on network error
      const basicDescription = generateBasicImageDescription(image_url, context);
      res.json({ description: basicDescription, vocabulary: [] });
      return;
    }

    if (!openaiResponse.ok) {
      console.error('OpenAI Vision API error:', await openaiResponse.text());
      // Fallback to basic description
      const basicDescription = generateBasicImageDescription(image_url, context);
      res.json({ description: basicDescription, vocabulary: [] });
      return;
    }

    const openaiResult = await openaiResponse.json();
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

      res.json({
        description: analysis.description || 'This image shows an interesting scene from the story.',
        vocabulary: analysis.vocabulary || [],
        updated_page: !!page_id
      });
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to basic description if AI response is not valid JSON
      const basicDescription = generateBasicImageDescription(image_url, context);
      res.json({ description: basicDescription, vocabulary: [] });
    }
  } catch (error) {
    console.error('Image analysis error:', error);
    // Fallback to basic description
    const basicDescription = generateBasicImageDescription(req.body.image_url, req.body.context);
    res.json({ description: basicDescription, vocabulary: [] });
  }
});

/**
 * Batch Analyze Images for Book Pages
 * POST /api/books/:bookId/analyze-images
 */
router.post('/:bookId/analyze-images', authenticateToken, requireRole(['admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { force_reanalyze = false } = req.body;

    // Get all pages for the book
    const { data: pages, error: pagesError } = await supabase
      .from('book_pages')
      .select('id, page_number, image_url, image_description')
      .eq('book_id', bookId)
      .order('page_number', { ascending: true });

    if (pagesError || !pages) {
      res.status(404).json({ error: 'Book pages not found' });
      return;
    }

    const results = [];
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const page of pages) {
      // Skip if already has description and not forcing reanalysis
      if (page.image_description && !force_reanalyze) {
        skipped++;
        continue;
      }

      try {
        // Analyze image (reuse the logic from single image analysis)
        const analysisResponse = await fetch(`${req.protocol}://${req.get('host')}/api/books/analyze-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || ''
          },
          body: JSON.stringify({
            image_url: page.image_url,
            page_id: page.id,
            context: `Page ${page.page_number} from children's book`
          })
        });

        if (analysisResponse.ok) {
          const analysis = await analysisResponse.json();
          results.push({
            page_id: page.id,
            page_number: page.page_number,
            description: analysis.description,
            vocabulary: analysis.vocabulary
          });
          processed++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error(`Error analyzing page ${page.page_number}:`, error);
        errors++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      message: 'Batch image analysis completed',
      summary: {
        total_pages: pages.length,
        processed,
        skipped,
        errors
      },
      results
    });
  } catch (error) {
    console.error('Batch image analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for basic image description
function generateBasicImageDescription(imageUrl: string, context?: string): string {
  const contextDescriptions = {
    'cover': 'This is the cover of a children\'s book with colorful illustrations.',
    'story': 'This page shows an illustration from the story with characters and scenes.',
    'educational': 'This educational illustration helps children learn new concepts.',
    'default': 'This image shows an interesting scene that helps tell the story.'
  };

  const contextKey = context?.toLowerCase() || 'default';
  return contextDescriptions[contextKey as keyof typeof contextDescriptions] || contextDescriptions.default;
}

/**
 * Extract Vocabulary from Image Descriptions
 * POST /api/books/extract-vocabulary
 */
router.post('/extract-vocabulary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, difficulty_level = 'beginner', max_words = 5 } = req.body;
    const { userId } = (req as any).user;

    if (!description) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }

    let extractedVocabulary = [];

    try {
      // Check if OpenAI configuration is available
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing, using basic vocabulary extraction');
        extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
      } else {
        // Use OpenAI for intelligent vocabulary extraction
        const openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4',
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
          timeout: 10000
        });

        if (openaiResponse.ok) {
          const openaiResult = await openaiResponse.json();
          const aiContent = openaiResult.choices[0]?.message?.content;
          
          try {
            extractedVocabulary = JSON.parse(aiContent);
          } catch (parseError) {
            console.error('Failed to parse AI vocabulary response:', parseError);
            extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
          }
        } else {
          extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
        }
      }
    } catch (error) {
      console.error('Vocabulary extraction error:', error);
      extractedVocabulary = extractBasicVocabulary(description, difficulty_level, max_words);
    }

    // Store extracted vocabulary in database
    const vocabularyToStore = [];
    for (const vocab of extractedVocabulary) {
      try {
        // Check if word already exists
        const { data: existingWord } = await supabase
          .from('vocabulary_words')
          .select('id')
          .eq('word', vocab.word.toLowerCase())
          .single();

        if (!existingWord) {
          // Insert new vocabulary word
          const { data: newWord, error: insertError } = await supabase
            .from('vocabulary_words')
            .insert({
              word: vocab.word.toLowerCase(),
              definition: vocab.definition,
              difficulty_level: vocab.difficulty_level || difficulty_level,
              part_of_speech: vocab.part_of_speech || 'noun',
              example_sentence: vocab.example_sentence || `This is an example with ${vocab.word}.`,
              created_by: userId
            })
            .select()
            .single();

          if (!insertError && newWord) {
            vocabularyToStore.push(newWord);
          }
        } else {
          vocabularyToStore.push({ id: existingWord.id, ...vocab });
        }
      } catch (error) {
        console.error('Error storing vocabulary word:', vocab.word, error);
      }
    }

    res.json({
      message: `Extracted ${extractedVocabulary.length} vocabulary words`,
      vocabulary: extractedVocabulary,
      stored_count: vocabularyToStore.length
    });
  } catch (error) {
    console.error('Extract vocabulary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for basic vocabulary extraction
function extractBasicVocabulary(description: string, difficultyLevel: string, maxWords: number) {
  // Simple word extraction based on common patterns
  const words = description.toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .split(' ')
    .filter(word => word.length > 3 && word.length < 12)
    .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there', 'could', 'other', 'more', 'very', 'what', 'know', 'just', 'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life', 'only', 'can', 'still', 'should', 'after', 'being', 'now', 'made', 'before', 'here', 'through', 'when', 'where', 'much', 'some', 'these', 'many', 'then', 'them', 'well', 'were'].includes(word));

  // Get unique words and limit to maxWords
  const uniqueWords = [...new Set(words)].slice(0, maxWords);
  
  return uniqueWords.map(word => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    definition: `A word that appears in the story: ${word}`,
    difficulty_level: difficultyLevel,
    part_of_speech: 'noun',
    example_sentence: `The story mentions ${word}.`
  }));
}

/**
 * AI Book Discussion
 * POST /api/books/discuss
 */
router.post('/discuss', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { book_id, page_number, message, conversation_history = [] } = req.body;
    const { userId } = (req as any).user;

    // Validate required fields
    if (!book_id || !message) {
      res.status(400).json({ error: 'Book ID and message are required' });
      return;
    }

    // Get book and page information for context
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', book_id)
      .eq('is_public', true)
      .single();

    if (bookError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    let pageContext = '';
    if (page_number) {
      const { data: page, error: pageError } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', book_id)
        .eq('page_number', page_number)
        .single();

      if (!pageError && page) {
        pageContext = `\nCurrent page ${page_number}: "${page.text_content}"`;
        if (page.ai_description) {
          pageContext += `\nPage illustration: ${page.ai_description}`;
        }
      }
    }

    let aiResponse = '';

    try {
      // Check if OpenAI configuration is available
      if (!process.env.OPENAI_BASE_URL || 
          !process.env.OPENAI_API_KEY || 
          process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
          process.env.OPENAI_API_KEY.length < 10) {
        console.warn('OpenAI configuration missing, using fallback response');
        aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
      } else {
        // Build conversation context
        const messages = [
          {
            role: 'system',
            content: `You are a friendly AI tutor helping children discuss and understand books. You're discussing "${book.title}" - ${book.description}. Target age: ${book.target_age_min}-${book.target_age_max} years. Difficulty: ${book.difficulty_level}.\n\nGuidelines:\n- Use age-appropriate language\n- Be encouraging and positive\n- Ask follow-up questions to promote thinking\n- Help with vocabulary and comprehension\n- Make learning fun and engaging\n- Keep responses concise but helpful${pageContext}`
          },
          ...conversation_history.slice(-6), // Keep last 6 messages for context
          {
            role: 'user',
            content: message
          }
        ];

        const openaiResponse = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4',
            messages,
            max_tokens: 300,
            temperature: 0.7
          }),
          timeout: 15000
        });

        if (openaiResponse.ok) {
          const openaiResult = await openaiResponse.json();
          aiResponse = openaiResult.choices[0]?.message?.content || 'I\'m sorry, I couldn\'t understand that. Could you ask me something else about the book?';
        } else {
          aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
        }
      }
    } catch (error) {
      console.error('AI discussion error:', error);
      aiResponse = generateFallbackDiscussionResponse(message, book, pageContext);
    }

    // Save discussion to database (optional - for tracking)
    try {
      await supabase
        .from('book_discussions')
        .insert({
          user_id: userId,
          book_id,
          page_number,
          user_message: message,
          ai_response: aiResponse,
          created_at: new Date().toISOString()
        });
    } catch (dbError) {
      console.error('Failed to save discussion:', dbError);
      // Continue even if saving fails
    }

    res.json({
      message: 'Discussion response generated',
      response: aiResponse,
      book_title: book.title,
      page_number: page_number || null
    });
  } catch (error) {
    console.error('Book discussion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get Discussion History
 * GET /api/books/discussions
 */
router.get('/discussions', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { book_id, page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('book_discussions')
      .select(`
        *,
        books (
          id,
          title
        )
      `)
      .eq('user_id', userId);

    if (book_id) {
      query = query.eq('book_id', book_id);
    }

    const { data: discussions, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch discussions' });
      return;
    }

    res.json({
      discussions: discussions || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function for fallback discussion responses
function generateFallbackDiscussionResponse(message: string, book: any, pageContext: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Simple pattern matching for common questions
  if (lowerMessage.includes('what') && (lowerMessage.includes('happen') || lowerMessage.includes('story'))) {
    return `That's a great question about "${book.title}"! This story is about ${book.description}. What part of the story interests you the most?`;
  }
  
  if (lowerMessage.includes('who') && (lowerMessage.includes('character') || lowerMessage.includes('main'))) {
    return `The characters in "${book.title}" are really interesting! This book is designed for children aged ${book.target_age_min}-${book.target_age_max}. Can you tell me which character you like best?`;
  }
  
  if (lowerMessage.includes('why') || lowerMessage.includes('how')) {
    return `That's a thoughtful question! "${book.title}" has many interesting parts to explore. What made you think about that? I'd love to hear your ideas!`;
  }
  
  if (lowerMessage.includes('word') || lowerMessage.includes('mean')) {
    return `Great question about vocabulary! Learning new words is so important. Can you tell me which word you'd like to understand better? I can help explain it!`;
  }
  
  if (lowerMessage.includes('like') || lowerMessage.includes('favorite')) {
    return `I love hearing about your favorites! "${book.title}" has so many wonderful parts. What do you like most about this story?`;
  }
  
  // Default response
  return `That's an interesting thought about "${book.title}"! This ${book.difficulty_level} level book has lots to discover. Can you tell me more about what you're thinking?`;
}

export default router;
