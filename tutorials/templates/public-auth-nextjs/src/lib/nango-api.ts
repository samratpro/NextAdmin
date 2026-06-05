const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface SessionUser {
  userId?: number;
  id?: number;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? JSON.parse(text) : ({} as T);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (refreshResponse.ok) {
      return request<T>(path, init, false);
    }
  }

  const data = await parseJson<any>(response);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const authApi = {
  register(payload: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    return request<{ success: boolean; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyEmail(token: string) {
    return request<{ success: boolean; message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  login(email: string, password: string) {
    return request<{ success: boolean; message: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  forgotPassword(email: string) {
    return request<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, newPassword: string) {
    return request<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getCurrentUser() {
    return request<{ user: SessionUser }>('/auth/me', {
      method: 'GET',
    });
  },

  updateProfile(payload: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }) {
    return request<{ success: boolean; user: SessionUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
