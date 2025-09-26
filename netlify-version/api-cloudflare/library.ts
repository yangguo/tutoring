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

library.get('/', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const { data, error } = await supabase.from('books').select('*');
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ books: data });
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

    // First, check if the book exists and get its details
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Check authorization - only the uploader or admin can delete
    // Admins can delete any book, users can only delete books they uploaded
    const canDelete = 
      user.role === 'admin' || 
      (book.uploaded_by === user.userId);
    
    if (!canDelete) {
      return c.json({ error: 'Unauthorized: You can only delete books you uploaded or admin can delete any book' }, 403);
    }

    // Start a transaction-like operation by handling related data
    // Note: Most related tables have CASCADE DELETE, but we need to handle lesson_plans manually

    // 1. Remove book ID from lesson_plans.book_ids arrays
    const { data: lessonPlans, error: lessonError } = await supabase
      .from('lesson_plans')
      .select('id, book_ids')
      .contains('book_ids', [bookId]);

    if (lessonError) {
      console.error('Error fetching lesson plans:', lessonError);
      // Continue with deletion even if this fails
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

    // 2. Delete the book (this will cascade delete related records automatically)
    // Tables with CASCADE DELETE: book_pages, reading_sessions, speaking_sessions, book_discussions
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId);

    if (deleteError) {
      console.error('Error deleting book:', deleteError);
      return c.json({ error: 'Failed to delete book: ' + deleteError.message }, 500);
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
