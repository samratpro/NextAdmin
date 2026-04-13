'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/NextAdmin-api';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setState('error');
      setMessage('Missing verification token.');
      return;
    }

    authApi.verifyEmail(token)
      .then((result) => {
        setState('success');
        setMessage(result.message);
      })
      .catch((error: any) => {
        setState('error');
        setMessage(error.message || 'Verification failed');
      });
  }, [searchParams]);

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">Verify email</h1>
      <p className={`mt-6 text-sm ${state === 'error' ? 'text-red-600' : 'text-slate-600'}`}>{message}</p>

      {state !== 'loading' ? (
        <Link
          href="/login"
          className="mt-8 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-700"
        >
          Go to login
        </Link>
      ) : null}
    </main>
  );
}
