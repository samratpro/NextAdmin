'use client';

import { FormEvent, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/components/auth/AuthProvider';

export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [profileForm, setProfileForm] = useState({
    username: '',
    firstName: '',
    lastName: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      username: user.username || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  }, [user]);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setProfileMessage('');
    setSavingProfile(true);

    try {
      await updateProfile(profileForm);
      setProfileMessage('Profile updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Profile update failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPasswordMessage('');
    setSavingPassword(true);

    try {
      const message = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordMessage(message);
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err: any) {
      setError(err.message || 'Password change failed');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-slate-900">Profile</h1>
        <p className="mt-2 text-sm text-slate-600">Update account details and password from your custom frontend.</p>

        {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}

        <div className="mt-8 grid gap-6">
          <form onSubmit={handleProfileSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Account details</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <input
                placeholder="First name"
                value={profileForm.firstName}
                onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })}
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <input
                placeholder="Last name"
                value={profileForm.lastName}
                onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })}
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            <input
              value={profileForm.username}
              onChange={(event) => setProfileForm({ ...profileForm, username: event.target.value })}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
            />

            <p className="mt-4 text-sm text-slate-500">Email: {user?.email}</p>
            {profileMessage ? <p className="mt-3 text-sm text-emerald-700">{profileMessage}</p> : null}

            <button
              type="submit"
              disabled={savingProfile}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Save profile'}
            </button>
          </form>

          <form onSubmit={handlePasswordSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Change password</h2>

            <div className="mt-4 grid gap-4">
              <input
                required
                type="password"
                placeholder="Current password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <input
                required
                minLength={8}
                type="password"
                placeholder="New password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            {passwordMessage ? <p className="mt-3 text-sm text-emerald-700">{passwordMessage}</p> : null}

            <button
              type="submit"
              disabled={savingPassword}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingPassword ? 'Updating...' : 'Change password'}
            </button>
          </form>
        </div>
      </main>
    </ProtectedRoute>
  );
}
