import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { jwtMiddleware, type SessionPayload } from './utils/jwt';

type LibraryBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

const library = new Hono<LibraryBindings>();

const PUBLIC_BOOK_FILES_MARKER = '/object/public/book-files/';

const getStoragePathFromPublicUrl = (publicUrl?: string | null): string | null => {
  if (!publicUrl) {
    return null;
  }

  try {
    const parsed = new URL(publicUrl);
    const markerIndex = parsed.pathname.indexOf(PUBLIC_BOOK_FILES_MARKER);
    if (markerIndex === -1) {
      return null;
    }
    const relativePath = parsed.pathname.slice(markerIndex + PUBLIC_BOOK_FILES_MARKER.length);
    return relativePath || null;
  } catch {
    const parts = publicUrl.split(PUBLIC_BOOK_FILES_MARKER);
    if (parts.length === 2 && parts[1]) {
      return parts[1].split('?')[0] || null;
    }
    return null;
  }
};

library.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data: books, error } = await supabase.from('books').select('*');
    if (error) return c.json({ error: error.message }, 500);

    // Load page counts & first-page covers to avoid empty page counts and placeholders
    const pageMeta: Record<string, { count: number; cover?: string | null }> = {};
    if (books && books.length > 0) {
      const bookIds = books.map(book => book.id);
      const { data: pageRows, error: pageError } = await supabase
        .from('book_pages')
        .select('book_id, image_url, page_number')
        .in('book_id', bookIds)
        .order('page_number', { ascending: true });

      if (pageError) {
        console.error('Error fetching page counts:', pageError);
      } else if (pageRows) {
        pageRows.forEach(row => {
          const existing = pageMeta[row.book_id] || { count: 0, cover: null };
          pageMeta[row.book_id] = {
            count: existing.count + 1,
            cover: existing.cover || row.image_url || null
          };
        });
      }
    }

    const booksWithCounts = (books || []).map(book => ({
      ...book,
      page_count: book.page_count || pageMeta[book.id]?.count || 0,
      cover_image_url: book.cover_image_url || pageMeta[book.id]?.cover || null
    }));

    return c.json({ books: booksWithCounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load library';
    return c.json({ error: message }, 500);
  }
});

// DELETE /api/library/:bookId - Delete a book and all related data
library.delete('/:bookId', jwtMiddleware, async (c) => {
  try {
    const bookId = c.req.param('bookId');
    const user = c.get('user');
    const supabase = createSupabaseClient(c.env);

    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    // Get book details and file paths
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, uploaded_by, file_path, file_url')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Check authorization - admin can delete any book, others only their own
    const canDelete = 
      user.role === 'admin' || 
      (book.uploaded_by === user.userId);
    
    if (!canDelete) {
      return c.json({ error: 'Unauthorized: You can only delete books you uploaded or admin can delete any book' }, 403);
    }

    // Get all book pages to collect their file paths
    const { data: pages } = await supabase
      .from('book_pages')
      .select('image_path, image_url')
      .eq('book_id', bookId);

    // Collect all files to delete from storage
    const filesToDelete: string[] = [];
    const bookFilePath = book.file_path ?? getStoragePathFromPublicUrl(book.file_url);
    if (bookFilePath) {
      filesToDelete.push(bookFilePath);
    }

    if (pages) {
      for (const page of pages) {
        const pagePath = page.image_path ?? getStoragePathFromPublicUrl(page.image_url);
        if (pagePath) {
          filesToDelete.push(pagePath);
        }
      }
    }

    // Remove book from associated lesson plans
    const { data: lessonPlans, error: lessonError } = await supabase
      .from('lesson_plans')
      .select('id, book_ids')
      .contains('book_ids', [bookId]);

    if (lessonError) {
      console.error('Error fetching lesson plans:', lessonError);
    }

    // Update lesson plans to remove the book ID
    if (lessonPlans && lessonPlans.length > 0) {
      for (const plan of lessonPlans) {
        const updatedBookIds = plan.book_ids.filter((id: string) => id !== bookId);
        await supabase
          .from('lesson_plans')
          .update({ book_ids: updatedBookIds })
          .eq('id', plan.id);
      }
    }

    // Delete book from database (cascades to book_pages, reading_sessions, speaking_sessions)
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId);

    if (deleteError) {
      console.error('Error deleting book:', deleteError);
      return c.json({ error: 'Failed to delete book: ' + deleteError.message }, 500);
    }

    // Delete files from storage (non-critical, log errors but don't fail)
    if (filesToDelete.length > 0) {
      try {
        const { error: storageError } = await supabase.storage
          .from('book-files')
          .remove(filesToDelete);
        
        if (storageError) {
          console.warn('Failed to delete some files from storage:', storageError);
        }
      } catch (storageError) {
        console.warn('Storage cleanup error:', storageError);
      }
    }

    return c.json({ 
      message: 'Book deleted successfully',
      deletedBook: {
        id: book.id,
        title: book.title
      }
    });

  } catch (error) {
    console.error('Error in delete book endpoint:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete book';
    return c.json({ error: message }, 500);
  }
});

export default library;
