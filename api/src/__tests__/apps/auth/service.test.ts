import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  User,
  EmailVerificationToken,
  PasswordResetToken,
  RefreshToken,
} from '../../../apps/auth/models';
import authService from '../../../apps/auth/service';

// Suppress email sending in tests
vi.mock('../../../core/email', () => ({
  default: {
    initialize: vi.fn(),
    sendVerificationEmail: vi.fn().mockResolvedValue(true),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
    sendPasswordChangedEmail: vi.fn().mockResolvedValue(true),
  },
}));

beforeAll(async () => {
  await User.createTable();
  await EmailVerificationToken.createTable();
  await PasswordResetToken.createTable();
  await RefreshToken.createTable();
});

describe('authService.register', () => {
  it('creates a new user and returns success', async () => {
    const result = await authService.register({
      username: 'testuser1',
      email: 'test1@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate email', async () => {
    await authService.register({ username: 'testuser2a', email: 'dup@example.com', password: 'password123' });
    const result = await authService.register({ username: 'testuser2b', email: 'dup@example.com', password: 'password123' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('already exists');
  });

  it('rejects duplicate username', async () => {
    await authService.register({ username: 'dupuser', email: 'unique1@example.com', password: 'password123' });
    const result = await authService.register({ username: 'dupuser', email: 'unique2@example.com', password: 'password123' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Username already taken');
  });
});

describe('authService.login', () => {
  beforeAll(async () => {
    // Register + activate a user
    await authService.register({ username: 'loginuser', email: 'loginuser@example.com', password: 'password123' });
    const user = await User.objects.get<any>({ email: 'loginuser@example.com' });
    user!.isActive = true;
    await user!.save();
  });

  it('returns tokens for valid credentials', async () => {
    const result = await authService.login({ email: 'loginuser@example.com', password: 'password123' });
    expect(result.success).toBe(true);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const result = await authService.login({ email: 'loginuser@example.com', password: 'wrongpass' });
    expect(result.success).toBe(false);
  });

  it('rejects inactive user', async () => {
    await authService.register({ username: 'inactiveuser', email: 'inactive@example.com', password: 'password123' });
    const result = await authService.login({ email: 'inactive@example.com', password: 'password123' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('verify your email');
  });
});

describe('authService.refreshAccessToken', () => {
  it('returns a new access token and rotates the refresh token', async () => {
    await authService.register({ username: 'refreshuser', email: 'refreshuser@example.com', password: 'password123' });
    const user = await User.objects.get<any>({ email: 'refreshuser@example.com' });
    user!.isActive = true;
    await user!.save();

    const loginResult = await authService.login({ email: 'refreshuser@example.com', password: 'password123' });
    expect(loginResult.success).toBe(true);
    const oldRefreshToken = loginResult.refreshToken!;

    const refreshResult = await authService.refreshAccessToken(oldRefreshToken);
    expect(refreshResult.success).toBe(true);
    expect(refreshResult.accessToken).toBeDefined();
    expect(refreshResult.refreshToken).toBeDefined();
    // Old token should be revoked — using it again should fail
    const reuse = await authService.refreshAccessToken(oldRefreshToken);
    expect(reuse.success).toBe(false);
  });

  it('rejects an invalid token string', async () => {
    const result = await authService.refreshAccessToken('not-a-real-token');
    expect(result.success).toBe(false);
  });
});
