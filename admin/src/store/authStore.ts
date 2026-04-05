import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  userId: number;
  email: string;
  username: string;
  isStaff: boolean;
  isSuperuser: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<'ok' | 'invalid' | 'forbidden'>;
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
        if (!response.user.isStaff && !response.user.isSuperuser) {
          // Valid credentials but not an admin/staff — revoke server session immediately
          try { await api.post('/auth/logout', {}); } catch {}
          return 'forbidden';
        }
        set({ user: response.user, isAuthenticated: true });
        return 'ok';
      }

      return 'invalid';
    } catch (error) {
      console.error('Login error:', error);
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
