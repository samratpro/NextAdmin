'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import Breadcrumbs from '@/components/Breadcrumbs';

interface SiteSettings {
  siteTitle: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  footerText: string;
  contactEmail: string;
  siteUrl: string;
  primaryColor: string;
}

const EMPTY: SiteSettings = {
  siteTitle: '',
  tagline: '',
  logoUrl: '',
  faviconUrl: '',
  footerText: '',
  contactEmail: '',
  siteUrl: '',
  primaryColor: '#4f46e5',
};

export default function SiteSettingsPage() {
  const [form, setForm] = useState<SiteSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const CACHE_KEY = 'site_settings_cache';

  useEffect(() => {
    // Show cached values instantly, then update from API in background
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        setForm({ ...EMPTY, ...JSON.parse(cached) });
        setLoading(false);
      }
    } catch {}

    api.getSiteSettings()
      .then((res) => {
        const s = { ...EMPTY, ...res.settings };
        setForm(s);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
      })
      .catch(() => setNotification({ type: 'error', message: 'Failed to load settings' }))
      .finally(() => setLoading(false));
  }, []);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSiteSettings(form as unknown as Record<string, string>);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(form)); } catch {}
      notify('success', 'Settings saved successfully!');
    } catch {
      notify('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File, type: 'logo' | 'favicon') => {
    if (type === 'logo') setUploadingLogo(true);
    else setUploadingFavicon(true);
    try {
      const res = await api.uploadSettingsFile(file, type);
      if (res.url) {
        setForm(prev => ({ ...prev, [type === 'logo' ? 'logoUrl' : 'faviconUrl']: res.url }));
        notify('success', `${type === 'logo' ? 'Logo' : 'Favicon'} uploaded!`);
      }
    } catch {
      notify('error', 'Upload failed');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingFavicon(false);
    }
  };

  const set = (key: keyof SiteSettings, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {notification.message}
        </div>
      )}

      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumbs items={[{ label: 'Site Settings' }]} />
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Site Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage branding, title, logo, and other site-wide settings.</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSave} className="space-y-6">

          {/* Branding */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Branding</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Site Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.siteTitle}
                  onChange={e => set('siteTitle', e.target.value)}
                  required
                  placeholder="My Awesome Site"
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tagline</label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={e => set('tagline', e.target.value)}
                  placeholder="Building the future, one line at a time"
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={e => set('primaryColor', e.target.value)}
                    className="h-10 w-16 border border-gray-300 rounded-lg cursor-pointer p-1"
                  />
                  <input
                    type="text"
                    value={form.primaryColor}
                    onChange={e => set('primaryColor', e.target.value)}
                    placeholder="#4f46e5"
                    className="flex-1 border border-gray-300 rounded-lg py-2.5 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Logo & Favicon */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Logo &amp; Favicon</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Logo</label>
                {form.logoUrl && (
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${form.logoUrl}`}
                    alt="Logo preview"
                    className="h-16 w-auto mb-2 rounded border border-gray-200 object-contain bg-gray-50 p-1"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.logoUrl}
                    onChange={e => set('logoUrl', e.target.value)}
                    placeholder="https://... or upload"
                    className="flex-1 border border-gray-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${uploadingLogo ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                    {uploadingLogo ? 'Uploading...' : 'Upload'}
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      disabled={uploadingLogo}
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logo'); e.target.value = ''; }}
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">Recommended: SVG or PNG with transparent background. Max 2 MB.</p>
              </div>

              {/* Favicon */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Favicon</label>
                {form.faviconUrl && (
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${form.faviconUrl}`}
                    alt="Favicon preview"
                    className="h-10 w-10 mb-2 rounded border border-gray-200 object-contain bg-gray-50 p-1"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.faviconUrl}
                    onChange={e => set('faviconUrl', e.target.value)}
                    placeholder="https://... or upload"
                    className="flex-1 border border-gray-300 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${uploadingFavicon ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
                    {uploadingFavicon ? 'Uploading...' : 'Upload'}
                    <input
                      ref={faviconRef}
                      type="file"
                      accept="image/png,image/x-icon,image/svg+xml"
                      disabled={uploadingFavicon}
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'favicon'); e.target.value = ''; }}
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">Recommended: 32×32 or 64×64 PNG/ICO. Max 2 MB.</p>
              </div>
            </div>
          </section>

          {/* Contact & URLs */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Contact &amp; URLs</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Site URL</label>
                <input
                  type="url"
                  value={form.siteUrl}
                  onChange={e => set('siteUrl', e.target.value)}
                  placeholder="https://example.com"
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={e => set('contactEmail', e.target.value)}
                  placeholder="hello@example.com"
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Footer Text</label>
                <input
                  type="text"
                  value={form.footerText}
                  onChange={e => set('footerText', e.target.value)}
                  placeholder="© 2026 My Site. All rights reserved."
                  className="block w-full border border-gray-300 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </section>

          {/* Public API note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <strong>Frontend integration:</strong> These settings are publicly available at{' '}
            <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">GET /api/settings</code>{' '}
            — fetch this endpoint in your frontend to dynamically apply the logo, title, and other branding.
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
