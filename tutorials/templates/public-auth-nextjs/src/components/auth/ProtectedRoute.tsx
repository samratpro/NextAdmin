'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/dashboard')}`);
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-slate-500">Checking session...</div>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
