# Site Settings

This guide explains how the site settings feature works, how to manage it from the admin panel, and how to consume it in any public frontend.

---

## What It Is

Site settings let you control branding and identity from the admin panel without touching code or environment variables.

| Field | Purpose |
|---|---|
| `siteTitle` | Main title shown in browser tabs, OG tags, etc. |
| `tagline` | Subtitle or slogan shown on the homepage |
| `logoUrl` | Path or URL to the site logo (upload or external) |
| `faviconUrl` | Path or URL to the favicon (upload or external) |
| `footerText` | Footer copyright or credit line |
| `contactEmail` | Public contact email |
| `siteUrl` | Canonical public URL of the site |
| `primaryColor` | Hex color for the primary brand color |

---

## Managing Settings in the Admin Panel

1. Log in as a superuser
2. Click **🎨 Site Settings** in the sidebar
3. Fill in the fields and upload logo/favicon images
4. Click **Save Settings**

Uploaded files are stored at `api/public/uploads/settings/` and served at `/uploads/settings/logo.<ext>` and `/uploads/settings/favicon.<ext>`.

The logo and favicon URL fields accept both relative paths (e.g. `/uploads/settings/logo.png` from an upload) and full external URLs (e.g. `https://cdn.example.com/logo.png`).

The admin settings page loads instantly on repeat visits using a `localStorage` cache. The cached values are shown immediately while the API response loads in the background and updates the form silently. The cache is also updated on every successful save.

---

## API Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/settings` | None (public) | Read settings in any frontend |
| `GET` | `/api/admin/settings` | Superuser | Read settings in admin |
| `PUT` | `/api/admin/settings` | Superuser | Update settings |
| `POST` | `/api/admin/settings/upload?type=logo` | Superuser | Upload logo |
| `POST` | `/api/admin/settings/upload?type=favicon` | Superuser | Upload favicon |

---

## How It Works Internally

Settings are stored in a JSON file at `api/src/apps/settings_data/settings.json`. The service keeps them in memory after the first read, so repeated calls to `GET /api/settings` are served from cache — no disk I/O on every request. The cache is updated immediately when settings are saved, so there is no stale-data window.

---

## Integrating With a Next.js Public Frontend

### 1. Fetch settings once in the root layout

Use Next.js server-side `fetch` with `revalidate` so settings are re-read from the API at most once per minute. All pages share the same cached value.

```ts
// app/layout.tsx
import type { Metadata } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getSiteSettings() {
  try {
    const res = await fetch(`${API_URL}/api/settings`, {
      next: { revalidate: 60 }, // re-fetch at most every 60 seconds
    });
    const data = await res.json();
    return data.settings;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: s?.siteTitle || 'My Site',
    description: s?.tagline || '',
    icons: s?.faviconUrl ? { icon: `${API_URL}${s.faviconUrl}` } : undefined,
    openGraph: {
      title: s?.siteTitle || 'My Site',
      description: s?.tagline || '',
      images: s?.logoUrl ? [`${API_URL}${s.logoUrl}`] : [],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const primaryColor = settings?.primaryColor || '#4f46e5';

  return (
    <html lang="en" style={{ '--color-primary': primaryColor } as React.CSSProperties}>
      <body>
        <Navbar settings={settings} />
        <main>{children}</main>
        <Footer text={settings?.footerText} />
      </body>
    </html>
  );
}
```

### 2. Pass settings to client components via props

```tsx
// components/Navbar.tsx (client component)
'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function Navbar({ settings }: { settings: any }) {
  const logoSrc = settings?.logoUrl
    ? settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_URL}${settings.logoUrl}`
    : null;

  return (
    <nav>
      {logoSrc ? (
        <img src={logoSrc} alt={settings.siteTitle} className="h-10 w-auto" />
      ) : (
        <span className="font-bold text-xl">{settings?.siteTitle}</span>
      )}
    </nav>
  );
}
```

### 3. Apply the primary color via CSS variable

```css
/* globals.css */
.btn-primary {
  background-color: var(--color-primary);
}
```

The `--color-primary` CSS variable is set on `<html>` from `layout.tsx` (shown above), so it is available everywhere in the app.

### 4. Footer

```tsx
// components/Footer.tsx
export function Footer({ text }: { text?: string }) {
  return (
    <footer className="border-t py-6 text-center text-sm text-gray-500">
      {text || `© ${new Date().getFullYear()} All rights reserved.`}
    </footer>
  );
}
```

---

## Integrating With a Plain React (Vite/CRA) Frontend

Use a context provider with `localStorage` caching so settings appear instantly on every page load after the first visit.

```tsx
// src/context/SettingsContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const CACHE_KEY = 'site_settings_cache';

const SettingsContext = createContext<any>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<any>(() => {
    // Load from cache synchronously — no loading flash on repeat visits
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Fetch fresh data in background and update cache
    fetch(`${API_URL}/api/settings`)
      .then(r => r.json())
      .then(d => {
        setSettings(d.settings);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(d.settings)); } catch {}
      })
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
```

```tsx
// src/main.tsx
import { SettingsProvider } from './context/SettingsContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
);
```

```tsx
// src/components/Navbar.tsx
import { useSettings } from '../context/SettingsContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function Navbar() {
  const s = useSettings();
  const logoSrc = s?.logoUrl
    ? s.logoUrl.startsWith('http') ? s.logoUrl : `${API_URL}${s.logoUrl}`
    : null;

  return (
    <nav>
      {logoSrc ? (
        <img src={logoSrc} alt={s?.siteTitle} className="h-10" />
      ) : (
        <span>{s?.siteTitle}</span>
      )}
    </nav>
  );
}
```

---

## Performance Notes

| Layer | What happens |
|---|---|
| API server | Settings read from disk once, then served from memory — no disk I/O per request |
| Admin save | Memory cache updated immediately — no stale window |
| Admin panel UI | `localStorage` cache shown instantly on repeat opens, API refreshes in background |
| Next.js frontend | `fetch` with `revalidate: 60` — one API call per minute per deployment instance |
| React/Vite frontend | `localStorage` cache renders synchronously before first paint; API refreshes silently |

For most sites this is more than fast enough. The JSON file is tiny (~300 bytes) and the API response adds no database overhead.

---

## Adding More Settings Fields

1. Add the new field to the `SiteSettings` interface in `api/src/apps/settings/service.ts` and add its default to `DEFAULTS`
2. Add it to the `allowed` array in the `PUT /api/admin/settings` handler in `routes.ts`
3. Add the form field to `admin/src/app/dashboard/settings/page.tsx`
4. Consume it in your frontend via `GET /api/settings`

No migrations needed — settings are file-based.
