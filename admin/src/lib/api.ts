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
  async get(endpoint: string, config?: any) {
    const response = await this.client.get(endpoint, config);
    return response.data;
  }

  async post(endpoint: string, data: any, config?: any) {
    const response = await this.client.post(endpoint, data, config);
    return response.data;
  }

  async put(endpoint: string, data: any, config?: any) {
    const response = await this.client.put(endpoint, data, config);
    return response.data;
  }

  async delete(endpoint: string, config?: any) {
    const response = await this.client.delete(endpoint, config);
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

  async getBackupSchedule(): Promise<{
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    hour: number;
    minute: number;
    keepCount: number;
    uploadToDrive: boolean;
    bandwidthLimitMbps: number;
  }> {
    const response = await this.client.get('/api/admin/backup/schedule');
    return response.data;
  }

  async saveBackupSchedule(config: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    hour: number;
    minute: number;
    keepCount: number;
    uploadToDrive: boolean;
    bandwidthLimitMbps: number;
  }): Promise<{ success: boolean; config: typeof config }> {
    const response = await this.client.post('/api/admin/backup/schedule', config);
    return response.data;
  }

  async runBackupNow(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post('/api/admin/backup/schedule/run-now');
    return response.data;
  }

  async getBackupLog(): Promise<{
    running: boolean;
    log: Array<{
      at: string;
      trigger: 'schedule' | 'manual';
      status: 'success' | 'error';
      file?: string;
      sizeBytes?: number;
      durationMs: number;
      uploadedDrive: boolean;
      deletedLocal: number;
      deletedDrive: number;
      error?: string;
    }>;
  }> {
    const response = await this.client.get('/api/admin/backup/log');
    return response.data;
  }

  // SEO Management
  async getSeoRobots() {
    return this.get('/api/admin/seo/robots');
  }

  async updateSeoRobots(content: string) {
    return this.post('/api/admin/seo/robots', { content });
  }

  async getSeoGlobalScripts() {
    return this.get('/api/admin/seo/scripts');
  }

  async updateSeoGlobalScripts(data: any) {
    return this.post('/api/admin/seo/scripts', data);
  }

  async listSeoPages() {
    return this.get('/api/admin/seo/pages');
  }

  async updateSeoPage(data: any) {
    return this.post('/api/admin/seo/pages', data);
  }

  async deleteSeoPage(slug: string) {
    return this.delete(`/api/admin/seo/pages?slug=${encodeURIComponent(slug)}`);
  }

  async getSeoSitemapConfig() {
    return this.get('/api/admin/seo/sitemap');
  }

  async updateSeoSitemapConfig(data: any) {
    return this.post('/api/admin/seo/sitemap', data);
  }

  async uploadSeoImage(file: File, slug: string, imageType: 'og' | 'twitter') {
    const form = new FormData();
    form.append('file', file);
    return this.client.post(
      `/api/admin/seo/upload?slug=${encodeURIComponent(slug)}&type=${imageType}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(res => res.data);
  }

  async createSeoBackup(toDrive: boolean = false) {
    const response = await this.client.post(`/api/admin/seo/backup?drive=${toDrive}`);
    return response.data;
  }

  async restoreSeoBackup(file: File) {
    const form = new FormData();
    form.append('file', file);
    const response = await this.client.post('/api/admin/seo/restore', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }
}

export const api = new ApiClient();
