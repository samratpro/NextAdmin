import { renderHook, act } from '@testing-library/react';

// Mock the api module before importing the store
jest.mock('@/lib/api', () => ({
  api: {
    login: jest.fn(),
    post: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  // Reset store state between tests
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
  jest.clearAllMocks();
});

describe('authStore.login', () => {
  it('sets isAuthenticated and user on success', async () => {
    mockApi.login.mockResolvedValue({
      success: true,
      user: { userId: 1, email: 'a@test.com', username: 'alice', isStaff: true, isSuperuser: false },
    });

    const { result } = renderHook(() => useAuthStore());
    let status: 'ok' | 'invalid' | 'forbidden';

    await act(async () => {
      status = await result.current.login('a@test.com', 'password');
    });

    expect(status!).toBe('ok');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('a@test.com');
  });

  it('returns invalid when API returns success: false', async () => {
    mockApi.login.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useAuthStore());
    let status: 'ok' | 'invalid' | 'forbidden';

    await act(async () => {
      status = await result.current.login('bad@test.com', 'wrong');
    });

    expect(status!).toBe('invalid');
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('returns forbidden for non-staff users and clears the server session', async () => {
    mockApi.login.mockResolvedValue({
      success: true,
      user: { userId: 2, email: 'b@test.com', username: 'bob', isStaff: false, isSuperuser: false },
    });
    mockApi.post.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuthStore());
    let status: 'ok' | 'invalid' | 'forbidden';

    await act(async () => {
      status = await result.current.login('b@test.com', 'password');
    });

    expect(status!).toBe('forbidden');
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', {});
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('does not use localStorage for token storage', async () => {
    const setSpy = jest.spyOn(Storage.prototype, 'setItem');
    mockApi.login.mockResolvedValue({
      success: true,
      user: { userId: 2, email: 'b@test.com', username: 'bob', isStaff: false, isSuperuser: false },
    });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.login('b@test.com', 'password'); });

    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});

describe('authStore.logout', () => {
  it('clears user state and calls the logout endpoint', async () => {
    useAuthStore.setState({
      user: { userId: 1, email: 'a@test.com', username: 'alice', isStaff: true, isSuperuser: false },
      isAuthenticated: true,
    });
    mockApi.post.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.logout(); });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', {});
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('authStore.loadUser', () => {
  it('sets user from getCurrentUser on success', async () => {
    mockApi.getCurrentUser.mockResolvedValue({
      user: { userId: 3, email: 'c@test.com', username: 'carol', isStaff: false, isSuperuser: true },
    });

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.loadUser(); });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('sets isAuthenticated false when getCurrentUser throws', async () => {
    mockApi.getCurrentUser.mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useAuthStore());
    await act(async () => { await result.current.loadUser(); });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
