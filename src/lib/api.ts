/**
 * API utilities for the Interactive English Tutor frontend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'child' | 'parent' | 'admin';
  age?: number;
  grade_level?: string;
  parent_id?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  cover_image_url?: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  age_range: string;
  category: string;
  page_count: number;
  is_public: boolean;
  uploaded_by: string;
  created_at: string;
  pages?: BookPage[];
}

export interface BookPage {
  id: string;
  book_id: string;
  page_number: number;
  image_url: string;
  text_content?: string;
  audio_url?: string;
  image_description?: string;
  created_at: string;
}

export interface ReadingSession {
  id: string;
  user_id: string;
  book_id: string;
  pages_read: number;
  total_pages: number;
  time_spent: number;
  completed: boolean;
  created_at: string;
  book?: Book;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  points: number;
  earned?: boolean;
  earned_at?: string;
}

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  pronunciation?: string;
  example_sentence?: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  learned?: boolean;
}

export interface BookDiscussion {
  id: string;
  user_id: string;
  book_id: string;
  page_number?: number;
  user_message: string;
  ai_response: string;
  created_at: string;
}

export interface DiscussionMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  page_number?: number;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Safely get token from localStorage, handle cases where localStorage is not available
    try {
      this.token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    } catch (error) {
      this.token = null;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      // Handle network errors and other fetch failures
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Failed to connect to server. Please check your internet connection.');
      }
      throw error;
    }
  }

  // Authentication
  async register(userData: {
    username: string;
    email: string;
    password: string;
    role: string;
    age?: number;
    grade_level?: string;
    parent_id?: string;
  }) {
    return this.request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getProfile() {
    return this.request<{ user: User }>('/api/auth/me');
  }

  async updateProfile(updates: Partial<User>) {
    return this.request<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getChildren() {
    return this.request<{ children: User[] }>('/api/auth/children');
  }

  // Books
  async getBooks(params?: {
    category?: string;
    difficulty_level?: string;
    age_range?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    const query = searchParams.toString();
    return this.request<{ books: Book[]; total: number; page: number; totalPages: number }>(
      `/api/books${query ? `?${query}` : ''}`
    );
  }

  async getBook(bookId: string) {
    return this.request<{ book: Book }>(`/api/books/${bookId}`);
  }

  async createReadingSession(bookId: string, pagesRead: number, timeSpent: number, completed: boolean) {
    return this.request<{ session: ReadingSession }>('/api/books/reading-session', {
      method: 'POST',
      body: JSON.stringify({ book_id: bookId, pages_read: pagesRead, time_spent: timeSpent, completed }),
    });
  }

  async getReadingSessions() {
    return this.request<{ sessions: ReadingSession[] }>('/api/books/reading-sessions');
  }

  async getUserProgress() {
    return this.request<{ progress: any }>('/api/books/progress');
  }

  // Vocabulary
  async getVocabulary(params?: { difficulty_level?: string; category?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    const query = searchParams.toString();
    return this.request<{ words: VocabularyWord[] }>(
      `/api/books/vocabulary${query ? `?${query}` : ''}`
    );
  }

  async learnWord(wordId: string) {
    return this.request('/api/books/vocabulary/learn', {
      method: 'POST',
      body: JSON.stringify({ word_id: wordId }),
    });
  }

  async learnVocabulary(wordData: any) {
    return this.request('/api/books/vocabulary/learn', {
      method: 'POST',
      body: JSON.stringify(wordData),
    });
  }

  async learnVocabularyWord(wordId: string) {
    return this.request('/api/books/vocabulary/learn', {
      method: 'POST',
      body: JSON.stringify({ word_id: wordId }),
    });
  }

  async createSpeakingSession(sessionData: any) {
    return this.request('/api/speaking/session', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async getLearnedVocabulary() {
    return this.request<{ words: VocabularyWord[] }>('/api/books/vocabulary/learned');
  }

  // Achievements
  async getAchievements() {
    return this.request<{ achievements: Achievement[] }>('/api/achievements');
  }

  async getUserAchievements(userId: string) {
    return this.request<{ achievements: Achievement[]; stats: any }>(`/api/achievements/user/${userId}`);
  }

  async getLeaderboard(limit = 10) {
    return this.request<{ leaderboard: any[] }>(`/api/achievements/leaderboard?limit=${limit}`);
  }

  // File Upload
  async uploadBook(formData: FormData) {
    const response = await fetch(`${this.baseURL}/api/upload/book`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async uploadBookPages(bookId: string, formData: FormData) {
    const response = await fetch(`${this.baseURL}/api/upload/book/${bookId}/pages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getUserBooks() {
    return this.request<{ books: Book[] }>('/api/upload/books');
  }

  async deleteBook(bookId: string) {
    return this.request(`/api/upload/book/${bookId}`, { method: 'DELETE' });
  }

  async updateBook(bookId: string, updates: Partial<{
    title: string;
    description: string;
    category: string;
    language: string;
    is_public: boolean;
    target_age_min: number;
    target_age_max: number;
    difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  }>) {
    return this.request<{ message: string; book: Book }>(`/api/upload/book/${bookId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // AI-powered Image Understanding
  async analyzeImage(imageUrl: string, pageId?: string, context?: string) {
    return this.request<{ description: string; vocabulary: VocabularyWord[]; updated_page?: boolean }>('/api/books/analyze-image', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl, page_id: pageId, context }),
    });
  }

  async extractVocabulary(description: string, difficultyLevel = 'beginner', maxWords = 5) {
    return this.request<{ message: string; vocabulary: VocabularyWord[]; stored_count: number }>('/api/books/extract-vocabulary', {
      method: 'POST',
      body: JSON.stringify({ description, difficulty_level: difficultyLevel, max_words: maxWords }),
    });
  }

  async batchAnalyzeImages(bookId: string, forceReanalyze = false) {
    return this.request<{ message: string; processed: number; skipped: number; errors: number; results: any[] }>(`/api/books/${bookId}/analyze-images`, {
      method: 'POST',
      body: JSON.stringify({ force_reanalyze: forceReanalyze }),
    });
  }

  // Book Discussions
  async discussBook(bookId: string, message: string, pageNumber?: number) {
    return this.request<{ response: string; discussion_id: string }>('/api/books/discuss', {
      method: 'POST',
      body: JSON.stringify({ book_id: bookId, message, page_number: pageNumber }),
    });
  }

  async getBookDiscussions(bookId?: string, page = 1, limit = 20) {
    const searchParams = new URLSearchParams();
    if (bookId) searchParams.append('book_id', bookId);
    searchParams.append('page', page.toString());
    searchParams.append('limit', limit.toString());
    
    return this.request<{ discussions: BookDiscussion[]; total: number; page: number; totalPages: number }>(
      `/api/books/discussions?${searchParams.toString()}`
    );
  }

  // Speaking Practice Chat
  async sendSpeakingPracticeMessage(message: string, history: any[], context: any) {
    return this.request<{ success: boolean; response: string; timestamp: string }>('/api/chat/speaking-practice', {
      method: 'POST',
      body: JSON.stringify({ message, history, context }),
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
