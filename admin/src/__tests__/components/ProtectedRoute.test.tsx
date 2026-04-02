import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock authStore
jest.mock('@/store/authStore', () => ({
  useAuthStore: jest.fn(),
}));

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

beforeEach(() => {
  mockPush.mockClear();
});

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as any);

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeTruthy();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('shows loading spinner while auth is resolving', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as any);

    const { container } = render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should not render children while loading
    expect(screen.queryByText('Protected Content')).toBeNull();
    // Should render something (a spinner or empty)
    expect(container.firstChild).toBeTruthy();
  });
});
