/**
 * File upload API routes for the Interactive English Tutor
 * Handle secure file uploads for picture books (PDF, JPG, PNG)
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import Joi from 'joi';
import { supabase } from '../config/supabase';
import { authenticateToken, requireRole } from '../utils/jwt';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF files are allowed.'));
    }
  }
});

// Validation schema for book metadata
const bookMetadataSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().optional(),
  target_age_min: Joi.number().integer().min(3).max(18).required(),
  target_age_max: Joi.number().integer().min(3).max(18).required(),
  difficulty_level: Joi.string().valid('beginner', 'intermediate', 'advanced').required(),
  category: Joi.string().optional(),
  language: Joi.string().default('en'),
  is_public: Joi.boolean().default(false)
}).options({ convert: true });

/**
 * Upload Picture Book
 * POST /api/upload/book
 */
router.post('/book', authenticateToken, requireRole(['parent', 'admin']), upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate metadata
    const { error: validationError, value } = bookMetadataSchema.validate(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    const { userId } = (req as any).user;
    const { title, description, target_age_min, target_age_max, difficulty_level, category, language, is_public } = value;
    
    // Generate unique filename
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
    const filePath = `books/${fileName}`;

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('book-files')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      res.status(500).json({ error: 'Failed to upload file' });
      return;
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('book-files')
      .getPublicUrl(filePath);

    // Create book record in database
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .insert({
        title,
        description,
        file_url: urlData.publicUrl,
        pdf_file_url: urlData.publicUrl, // Set pdf_file_url to satisfy NOT NULL constraint
        file_path: filePath,
        file_type: req.file.mimetype,
        target_age_min,
        target_age_max,
        difficulty_level,
        category,
        language,
        is_public,
        uploaded_by: userId
      })
      .select()
      .single();

    if (bookError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('book-files').remove([filePath]);
      console.error('Database error:', bookError);
      res.status(500).json({ error: 'Failed to create book record' });
      return;
    }

    res.status(201).json({
      message: 'Book uploaded successfully',
      book: {
        id: bookData.id,
        title: bookData.title,
        description: bookData.description,
        file_url: bookData.file_url,
        target_age_min: bookData.target_age_min,
        target_age_max: bookData.target_age_max,
        difficulty_level: bookData.difficulty_level,
        category: bookData.category,
        language: bookData.language,
        is_public: bookData.is_public,
        created_at: bookData.created_at
      }
    });
  } catch (error) {
    console.error('Upload book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Update Book Metadata
 * PATCH /api/upload/book/:bookId
 */
router.patch('/book/:bookId', authenticateToken, requireRole(['parent', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { userId, role } = (req as any).user;

    // Validate allowed fields (all optional)
    const updateSchema = Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().allow('').optional(),
      category: Joi.string().allow('').optional(),
      language: Joi.string().optional(),
      is_public: Joi.boolean().optional(),
      target_age_min: Joi.number().integer().min(3).max(18).optional(),
      target_age_max: Joi.number().integer().min(3).max(18).optional(),
      difficulty_level: Joi.string().valid('beginner', 'intermediate', 'advanced').optional()
    }).min(1);

    const { error: validationError, value: updates } = updateSchema.validate(req.body, { convert: true });
    if (validationError) {
      res.status(400).json({ error: validationError.details[0].message });
      return;
    }

    // Fetch book and verify ownership unless admin
    const { data: book, error: fetchError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (fetchError || !book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (role !== 'admin' && book.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    // Ensure age range consistency if provided
    if (updates.target_age_min !== undefined && updates.target_age_max !== undefined) {
      if (updates.target_age_min > updates.target_age_max) {
        res.status(400).json({ error: 'target_age_min cannot be greater than target_age_max' });
        return;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('books')
      .update({ ...updates })
      .eq('id', bookId)
      .select('*')
      .single();

    if (updateError) {
      res.status(500).json({ error: 'Failed to update book' });
      return;
    }

    res.json({ message: 'Book updated', book: updated });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Upload Book Page Images
 * POST /api/upload/book/:bookId/pages
 */
router.post('/book/:bookId/pages', authenticateToken, requireRole(['parent', 'admin']), upload.array('pages', 50), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const { userId } = (req as any).user;

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (bookData.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const uploadedPages = [];
    const failedUploads = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Generate unique filename
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${i}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const filePath = `book-pages/${bookId}/${fileName}`;

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('book-files')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          failedUploads.push({ filename: file.originalname, error: uploadError.message });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('book-files')
          .getPublicUrl(filePath);

        // Analyze image with AI (optional, non-blocking)
        let imageDescription = null;
        try {
          // Import OpenAI configuration
          const openaiConfig = process.env.OPENAI_API_KEY ? {
            apiKey: process.env.OPENAI_API_KEY
          } : null;

          if (openaiConfig) {
            const { OpenAI } = await import('openai');
            const openai = new OpenAI(openaiConfig);
            
            const response = await openai.chat.completions.create({
              model: process.env.OPENAI_VISION_MODEL || 'gpt-4-turbo',
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Analyze this children's book page image. Provide a detailed, educational description suitable for English language learners. Focus on objects, characters, actions, and educational content. Keep it age-appropriate and engaging."
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 300
            });
            
            imageDescription = response.choices[0]?.message?.content || null;
          }
        } catch (error) {
          console.log('AI image analysis failed, continuing without description:', error.message);
          // Continue without description - this is optional
        }

        // Create page record
        const { data: pageData, error: pageError } = await supabase
          .from('book_pages')
          .insert({
            book_id: bookId,
            page_number: i + 1,
            image_url: urlData.publicUrl,
            image_description: imageDescription
          })
          .select()
          .single();

        if (pageError) {
          // Clean up uploaded file if database insert fails
          await supabase.storage.from('book-files').remove([filePath]);
          failedUploads.push({ filename: file.originalname, error: 'Database error' });
          continue;
        }

        uploadedPages.push({
          id: pageData.id,
          page_number: pageData.page_number,
          image_url: pageData.image_url,
          filename: file.originalname
        });
      } catch (error) {
        failedUploads.push({ filename: file.originalname, error: 'Processing error' });
      }
    }

    res.status(201).json({
      message: `Uploaded ${uploadedPages.length} pages successfully`,
      uploaded_pages: uploadedPages,
      failed_uploads: failedUploads,
      total_files: files.length,
      successful_uploads: uploadedPages.length,
      failed_uploads_count: failedUploads.length
    });
  } catch (error) {
    console.error('Upload pages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get User's Uploaded Books
 * GET /api/upload/books
 */
router.get('/books', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 10 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    const { data: books, error } = await supabase
      .from('books')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch books' });
      return;
    }

    res.json({
      books: books || [],
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Delete Book
 * DELETE /api/upload/book/:bookId
 */
router.delete('/book/:bookId', authenticateToken, requireRole(['parent', 'admin']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookId } = req.params;
    const { userId } = (req as any).user;

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by, file_path')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    if (bookData.uploaded_by !== userId) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    // Get all book pages to delete their files
    const { data: pages } = await supabase
      .from('book_pages')
      .select('image_path')
      .eq('book_id', bookId);

    // Delete book pages from database
    await supabase
      .from('book_pages')
      .delete()
      .eq('book_id', bookId);

    // Delete book from database
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId);

    if (deleteError) {
      res.status(500).json({ error: 'Failed to delete book' });
      return;
    }

    // Delete files from storage
    const filesToDelete = [bookData.file_path];
    if (pages) {
      filesToDelete.push(...pages.map(page => page.image_path));
    }

    await supabase.storage
      .from('book-files')
      .remove(filesToDelete.filter(Boolean));

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
