import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { verifyToken, type SessionPayload } from './utils/jwt';

type BooksBindings = {
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: SessionPayload;
  };
};

const books = new Hono<BooksBindings>();

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
  const { bookId } = c.req.param();
  const supabase = createSupabaseClient(c.env);

  const authHeader = c.req.header('Authorization');
  let session: SessionPayload | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (secret) {
      session = await verifyToken(token, secret);
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
});

export default books;
