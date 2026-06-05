'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, SessionUser } from '@/lib/NextAdmin-api';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (payload: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<string>;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const result = await authApi.getCurrentUser();
      setUser((previous) => previous ? { ...previous, ...result.user } : result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await authApi.login(email, password);
      setUser(result.user);
    },
    async logout() {
      await authApi.logout();
      setUser(null);
    },
    async signup(payload) {
      const result = await authApi.register(payload);
      return result.message;
    },
    async refreshUser() {
      setLoading(true);
      await refreshUser();
    },
    async updateProfile(payload) {
      const result = await authApi.updateProfile(payload);
      setUser((previous) => previous ? { ...previous, ...result.user } : result.user);
    },
    async changePassword(currentPassword, newPassword) {
      const result = await authApi.changePassword(currentPassword, newPassword);
      return result.message;
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
