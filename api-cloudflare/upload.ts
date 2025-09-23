import { Hono } from 'hono';
import { handleError } from './utils/error';
import { createSupabaseClient } from './config/supabase';
import { type SessionPayload } from './utils/jwt';

type UploadBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
    OPENAI_API_KEY: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

const upload = new Hono<UploadBindings>();

// Validation schema for book metadata
const validateBookMetadata = (data: any) => {
  const errors: string[] = [];
  
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Title is required and must be a string');
  }
  
  if (data.target_age_min === undefined || data.target_age_min === null || 
      isNaN(Number(data.target_age_min)) || Number(data.target_age_min) < 3 || Number(data.target_age_min) > 18) {
    errors.push('target_age_min is required and must be between 3 and 18');
  }
  
  if (data.target_age_max === undefined || data.target_age_max === null || 
      isNaN(Number(data.target_age_max)) || Number(data.target_age_max) < 3 || Number(data.target_age_max) > 18) {
    errors.push('target_age_max is required and must be between 3 and 18');
  }
  
  if (Number(data.target_age_min) > Number(data.target_age_max)) {
    errors.push('target_age_min cannot be greater than target_age_max');
  }
  
  if (!data.difficulty_level || !['beginner', 'intermediate', 'advanced'].includes(data.difficulty_level)) {
    errors.push('difficulty_level is required and must be one of: beginner, intermediate, advanced');
  }
  
  return errors;
};

// Book upload endpoint
upload.post('/book', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    
    const { userId, role } = user;
    
    // Check if user has permission to upload books
    if (!['parent', 'admin'].includes(role)) {
      return c.json({ error: 'Permission denied. Only parents and admins can upload books.' }, 403);
    }

    // Parse form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Only JPG, PNG, and PDF files are allowed.' }, 400);
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return c.json({ error: 'File too large. Maximum size is 50MB.' }, 400);
    }

    // Extract and validate metadata
    const metadata = {
      title: formData.get('title') as string,
      description: formData.get('description') as string || '',
      target_age_min: Number(formData.get('target_age_min')),
      target_age_max: Number(formData.get('target_age_max')),
      difficulty_level: formData.get('difficulty_level') as string,
      category: formData.get('category') as string || 'general',
      language: formData.get('language') as string || 'en',
      is_public: formData.get('is_public') === 'true'
    };

    // Validate metadata
    const validationErrors = validateBookMetadata(metadata);
    if (validationErrors.length > 0) {
      return c.json({ error: validationErrors[0] }, 400);
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
    const filePath = `books/${userId}/${fileName}`;

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer();

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('book-files')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return c.json({ error: 'Failed to upload file to storage' }, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('book-files')
      .getPublicUrl(filePath);

    // Create book record in database
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .insert({
        title: metadata.title,
        description: metadata.description,
        file_url: urlData.publicUrl,
        pdf_file_url: urlData.publicUrl, // Set pdf_file_url to satisfy NOT NULL constraint
        file_path: filePath,
        file_type: file.type,
        target_age_min: metadata.target_age_min,
        target_age_max: metadata.target_age_max,
        difficulty_level: metadata.difficulty_level,
        category: metadata.category,
        language: metadata.language,
        is_public: metadata.is_public,
        uploaded_by: userId
      })
      .select()
      .single();

    if (bookError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('book-files').remove([filePath]);
      console.error('Database error:', bookError);
      return c.json({ error: 'Failed to create book record' }, 500);
    }

    return c.json({
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
    }, 201);
  } catch (error) {
    console.error('Upload book error:', error);
    return handleError(c, error);
  }
});

// Get user uploaded books
upload.get('/books', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    
    const { userId } = user;
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 10;
    
    const offset = (page - 1) * limit;

    const { data: books, error } = await supabase
      .from('books')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return c.json({ error: 'Failed to fetch books' }, 500);
    }

    return c.json({
      books: books || [],
      page,
      limit
    });
  } catch (error) {
    console.error('Get books error:', error);
    return handleError(c, error);
  }
});

// Delete book
upload.delete('/book/:bookId', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    
    const { userId, role } = user;
    const { bookId } = c.req.param();

    // Check if user has permission to delete books
    if (!['parent', 'admin'].includes(role)) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by, file_path')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      return c.json({ error: 'Book not found' }, 404);
    }

    if (role !== 'admin' && bookData.uploaded_by !== userId) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Remove book from associated lesson plans
    const { data: plans, error: planFindError } = await supabase
      .from('lesson_plans')
      .select('id, book_ids')
      .contains('book_ids', [bookId]);

    if (planFindError) {
      console.error('Failed to find lesson plans:', planFindError.message);
    } else if (plans && plans.length > 0) {
      for (const plan of plans) {
        const newBookIds = plan.book_ids.filter((bid: string) => bid !== bookId);
        const { error: planUpdateError } = await supabase
          .from('lesson_plans')
          .update({ book_ids: newBookIds })
          .eq('id', plan.id);
        if (planUpdateError) {
          console.error('Failed to update lesson plan:', planUpdateError.message);
        }
      }
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
      return c.json({ error: 'Failed to delete book' }, 500);
    }

    // Delete files from storage (non-blocking)
    try {
      const filesToDelete = [bookData.file_path];
      if (pages) {
        filesToDelete.push(...pages.map(p => p.image_path).filter(Boolean));
      }
      await supabase.storage.from('book-files').remove(filesToDelete);
    } catch (storageError) {
      console.warn('Failed to delete some files from storage:', storageError);
      // Don't fail the request if storage cleanup fails
    }

    return c.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    return handleError(c, error);
  }
});

export default upload;
