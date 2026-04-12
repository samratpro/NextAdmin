import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  userId: number;
  email: string;
  username: string;
  isStaff: boolean;
  isSuperuser: boolean;
}

export type LoginResult = 'ok' | 'invalid' | 'forbidden';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);

      if (response.success) {
        // Block regular users — admin panel is for staff and superusers only
        if (!response.user?.isStaff && !response.user?.isSuperuser) {
          // Clear the cookie the server just set
          try { await api.post('/auth/logout', {}); } catch {}
          return 'forbidden';
        }
        set({ user: response.user, isAuthenticated: true });
        return 'ok';
      }

      return 'invalid';
    } catch {
      return 'invalid';
    }
  },

  logout: async () => {
    try {
      // Ask the server to clear the httpOnly cookies
      await api.post('/auth/logout', {});
    } catch {
      // Proceed with local logout even if server call fails
    }
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      // Cookie is sent automatically — no localStorage check needed
      const response = await api.getCurrentUser();
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  checkAuth: () => {
    return get().isAuthenticated;
  },
}));
