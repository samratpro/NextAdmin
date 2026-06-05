'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/components/auth/AuthProvider';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">Custom Dashboard</p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-900">
              Welcome {user?.username}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              This page is part of your public product frontend, not the NextAdmin admin.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/profile" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Profile
            </Link>
            <button
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Email</p>
            <p className="mt-3 text-sm text-slate-900">{user?.email}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Staff</p>
            <p className="mt-3 text-sm text-slate-900">{user?.isStaff ? 'Yes' : 'No'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Superuser</p>
            <p className="mt-3 text-sm text-slate-900">{user?.isSuperuser ? 'Yes' : 'No'}</p>
          </div>
        </section>
      </main>
    </ProtectedRoute>
  );
}
