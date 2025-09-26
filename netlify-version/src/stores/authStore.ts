/**
 * Authentication store using Zustand
 */
import { create } from 'zustand';
import { api, type User } from '../lib/api';
import { toast } from 'sonner';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    username: string;
    email: string;
    password: string;
    role: string;
    age?: number;
    grade_level?: string;
    parent_id?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  checkAuth: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await api.login(email, password);
      api.setToken(response.token);
      set({ 
        user: response.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      toast.success(`Welcome back, ${response.user.username || response.user.email}!`);
    } catch (error) {
      set({ isLoading: false });
      const message = error instanceof Error ? error.message : 'Login failed';
      toast.error(message);
      throw error;
    }
  },

  register: async (userData) => {
    set({ isLoading: true });
    try {
      const response = await api.register(userData);
      api.setToken(response.token);
      set({ 
        user: response.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      toast.success(`Welcome to Interactive English Tutor, ${response.user.username || response.user.email}!`);
    } catch (error) {
      set({ isLoading: false });
      const message = error instanceof Error ? error.message : 'Registration failed';
      toast.error(message);
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await api.logout();
      api.setToken(null);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
      toast.success('Logged out successfully');
    } catch (error) {
      // Even if logout fails on server, clear local state
      api.setToken(null);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
      console.error('Logout error:', error);
    }
  },

  updateProfile: async (updates) => {
    const currentUser = get().user;
    if (!currentUser) return;

    set({ isLoading: true });
    try {
      const response = await api.updateProfile(updates);
      set({ 
        user: response.user, 
        isLoading: false 
      });
      toast.success('Profile updated successfully');
    } catch (error) {
      set({ isLoading: false });
      const message = error instanceof Error ? error.message : 'Profile update failed';
      toast.error(message);
      throw error;
    }
  },

  checkAuth: async () => {
    // Safety timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      set({ isAuthenticated: false, user: null, isLoading: false });
    }, 10000); // 10 second timeout

    const token = localStorage.getItem('auth_token');
    if (!token) {
      clearTimeout(timeoutId);
      set({ isAuthenticated: false, user: null, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      api.setToken(token);
      const response = await api.getProfile();
      clearTimeout(timeoutId);
      set({ 
        user: response.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    } catch (error) {
      // Token is invalid, clear it
      clearTimeout(timeoutId);
      api.setToken(null);
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
      console.error('Auth check failed:', error);
      // Don't show error toast for failed auth check on page load
    }
  },

  clearAuth: () => {
    api.setToken(null);
    set({ 
      user: null, 
      isAuthenticated: false, 
      isLoading: false 
    });
  }
}));