import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      // Send httpOnly cookies automatically on every request
      withCredentials: true,
    });

    // Handle automatic token refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // The refresh cookie is sent automatically via withCredentials
            await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
            // Retry original request — new accessToken cookie is already set by the server
            return this.client(originalRequest);
          } catch {
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(data: { username: string; email: string; password: string }) {
    const response = await this.client.post('/auth/register', data);
    return response.data;
  }

  async verifyEmail(token: string) {
    const response = await this.client.post('/auth/verify-email', { token });
    return response.data;
  }

  async forgotPassword(email: string) {
    const response = await this.client.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, newPassword: string) {
    const response = await this.client.post('/auth/reset-password', { token, newPassword });
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Generic CRUD operations
  async get(endpoint: string) {
    const response = await this.client.get(endpoint);
    return response.data;
  }

  async post(endpoint: string, data: any) {
    const response = await this.client.post(endpoint, data);
    return response.data;
  }

  async put(endpoint: string, data: any) {
    const response = await this.client.put(endpoint, data);
    return response.data;
  }

  async delete(endpoint: string) {
    const response = await this.client.delete(endpoint);
    return response.data;
  }
}

export const api = new ApiClient();
