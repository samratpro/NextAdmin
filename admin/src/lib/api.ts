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

  // Backup endpoints
  async getBackupDatabases() {
    const response = await this.client.get('/api/admin/backup/databases');
    return response.data;
  }

  async createBackup(dbPath: string) {
    const response = await this.client.post('/api/admin/backup/create', { dbPath });
    return response.data;
  }

  async listBackups() {
    const response = await this.client.get('/api/admin/backup/list');
    return response.data;
  }

  getDownloadDbUrl(dbPath: string): string {
    return `${API_URL}/api/admin/backup/download-db?dbPath=${encodeURIComponent(dbPath)}`;
  }

  getBackupFileDownloadUrl(filename: string): string {
    return `${API_URL}/api/admin/backup/files/${encodeURIComponent(filename)}/download`;
  }

  async deleteBackup(filename: string) {
    const response = await this.client.delete(`/api/admin/backup/files/${encodeURIComponent(filename)}`);
    return response.data;
  }

  async restoreBackup(file: File, dbPath?: string): Promise<any> {
    const form = new FormData();
    form.append('file', file);
    if (dbPath) form.append('dbPath', dbPath);
    const response = await this.client.post('/api/admin/backup/restore', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getDriveStatus(): Promise<{
    configured: boolean;
    authMethod: 'oauth2' | 'service_account' | null;
    canConnect: boolean;
    credentialsSource: 'file' | 'env' | null;
    folderName: string;
  }> {
    const response = await this.client.get('/api/admin/backup/drive/status');
    return response.data;
  }

  async getDriveAuthUrl(): Promise<{ authUrl: string }> {
    const response = await this.client.get('/api/admin/backup/drive/auth-url');
    return response.data;
  }

  async uploadDriveCredentials(file: File): Promise<{ success: boolean; clientId: string }> {
    const form = new FormData();
    form.append('file', file);
    const response = await this.client.post('/api/admin/backup/drive/credentials', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async removeDriveCredentials(): Promise<void> {
    await this.client.delete('/api/admin/backup/drive/credentials');
  }

  async disconnectDrive(): Promise<void> {
    await this.client.delete('/api/admin/backup/drive/disconnect');
  }

  async sendBackupToDrive(filename: string): Promise<{ success: boolean; fileId: string; webViewLink: string; folder: string }> {
    const response = await this.client.post(`/api/admin/backup/files/${encodeURIComponent(filename)}/send-to-drive`);
    return response.data;
  }
}

export const api = new ApiClient();
