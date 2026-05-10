# Headless SEO Integration Guide

NextAdmin provides a **file-based, slug-scoped SEO management system**. The Admin stores all SEO data on the server; your frontend fetches it at render time and injects it into the `<head>`. No database queries are needed on the frontend — everything is served as flat JSON files.

---

## How Data is Stored

Each page slug gets its own folder. Images are stored with **predictable filenames** so your frontend can construct URLs without storing explicit paths.

```
api/
├── seo_data/
│   ├── global_settings.json       ← header/footer scripts
│   ├── sitemap_config.json        ← sitemap rules & model selection
│   └── pages/
│       ├── home/
│       │   └── meta.json          ← SEO data for "/"
│       ├── about/
│       │   └── meta.json          ← SEO data for "/about"
│       └── blog__my-post/         ← "/" in slug becomes "__"
│           └── meta.json
└── public/
    └── uploads/seo/
        ├── about/
        │   ├── og-image.jpg       ← always this name
        │   └── twitter-image.png
        └── home/
            └── og-image.jpg
```

### Slug Naming Convention

| Frontend URL     | Slug in Admin  | Folder name        |
|-----------------|----------------|--------------------|
| `/`             | `home`         | `pages/home/`      |
| `/about`        | `about`        | `pages/about/`     |
| `/services`     | `services`     | `pages/services/`  |
| `/blog/my-post` | `blog/my-post` | `pages/blog__my-post/` |

---

## Public API Endpoints

All endpoints below are **public** (no authentication required). Use them in your frontend.

| Endpoint | Purpose |
|---|---|
| `GET /api/seo/head?slug=about` | Page-specific SEO metadata |
| `GET /api/seo/scripts` | Global header/footer scripts |
| `GET /api/seo/robots-text` | Robots.txt content |
| `GET /api/seo/sitemap-data` | List of URLs for sitemap |
| `GET /uploads/seo/{slug}/og-image.{ext}` | OG image (served as static file) |
| `GET /uploads/seo/{slug}/twitter-image.{ext}` | Twitter image |

---

## 1. Reusable SEO Helper

Create this once and use it across all pages:

```ts
// lib/seo.ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchPageSeo(slug: string) {
  try {
    const res = await fetch(`${API}/api/seo/head?slug=${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 }, // ISR — re-fetch every hour
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** Build the og/twitter image URL from a stored relative path */
export function seoImageUrl(relativePath: string | undefined): string | undefined {
  if (!relativePath) return undefined;
  return `${API}${relativePath}`;
}

/**
 * Construct predictable image URLs directly from slug (no stored path needed).
 * Falls back to stored ogImage if present.
 */
export function slugImageUrl(slug: string, type: 'og' | 'twitter', ext = 'jpg'): string {
  const safeSlug = slug.replace(/^\//, '').replace(/\//g, '__') || 'home';
  return `${API}/uploads/seo/${safeSlug}/${type}-image.${ext}`;
}
```

---

## 2. Static Page SEO (generateMetadata)

The primary use case for this system is **Static & Landing pages** (e.g., Home, About, Services). Add `generateMetadata` to each page. The slug corresponds to the URL path.

```tsx
// app/about/page.tsx
import type { Metadata } from 'next';
import { fetchPageSeo, seoImageUrl } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchPageSeo('about'); // priority for static pages
  if (!seo?.metaTitle) return { title: 'About Us' };

  return {
    title: seo.metaTitle,
    description: seo.metaDescription,
    robots: seo.noIndex ? 'noindex,nofollow' : 'index,follow',
    alternates: { canonical: seo.canonicalUrl || undefined },
    openGraph: {
      title: seo.ogTitle || seo.metaTitle,
      description: seo.ogDescription || seo.metaDescription,
      images: seo.ogImage ? [seoImageUrl(seo.ogImage)!] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.twitterTitle || seo.metaTitle,
      description: seo.twitterDescription || seo.metaDescription,
      images: seo.twitterImage ? [seoImageUrl(seo.twitterImage)!] : [],
    },
  };
}

/** 2.1 Structured Data (Schema) **/
export async function JsonLdSchema({ slug }: { slug: string }) {
  const seo = await fetchPageSeo(slug);
  if (!seo?.schema) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: seo.schema }}
    />
  );
}

export default function AboutPage() {
  return (
    <main>
      <JsonLdSchema slug="about" />
      {/* ... page content ... */}
    </main>
  );
}
```

---

## 3. Handling Dynamic Entities (Posts/Products)

For high-volume dynamic content like **Blog Posts** or **Products**, it is usually better to handle SEO fields directly within your Database Model (e.g., adding `metaTitle` to your Post schema).

**Only use this Admin SEO system for:**
- One-off landing pages (Home, Contact, FAQ).
- Marketing pages that need frequent adjustment without code changes.
- Global scripts and robots.txt.

---

## 3. Global Scripts (Layout)

Inject verification codes, analytics tags, and other global scripts managed from Admin → SEO → Global Config.

```tsx
// app/layout.tsx
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getGlobalScripts() {
  try {
    const res = await fetch(`${API}/api/seo/scripts`, { next: { revalidate: 3600 } });
    return res.ok ? res.json() : { headerScripts: '', footerScripts: '' };
  } catch {
    return { headerScripts: '', footerScripts: '' };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { headerScripts, footerScripts } = await getGlobalScripts();

  return (
    <html lang="en">
      <head>
        {headerScripts && (
          <script dangerouslySetInnerHTML={{ __html: headerScripts }} />
        )}
      </head>
      <body>
        {children}
        {footerScripts && (
          <script dangerouslySetInnerHTML={{ __html: footerScripts }} />
        )}
      </body>
    </html>
  );
}
```

---

## 4. XML Sitemap

The API returns all configured URLs (configured pages + static paths added in Admin), while respecting the exclusion list.

```ts
// app/sitemap.ts
import { MetadataRoute } from 'next';

const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SITE  = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const res = await fetch(`${API}/api/seo/sitemap-data`, { next: { revalidate: 3600 } });
  const urls: string[] = res.ok ? await res.json() : [];

  return urls.map(url => ({
    url: `${SITE}${url}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));
}
```

> **Admin controls**: Admin → SEO Management → XML Sitemap lets you set frequency, priority, and **Excluded URLs** (to hide specific pages like `/secret` or `/admin` from search engines).

---

## 5. Robots.txt

Manage your `robots.txt` content directly from the Admin panel.

```ts
// app/robots.ts
import { MetadataRoute } from 'next';

const API  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

export default async function robots(): Promise<MetadataRoute.Robots> {
  try {
    const res = await fetch(`${API}/api/seo/robots-text`, { next: { revalidate: 3600 } });
    const { content } = await res.json();

    if (content) {
      // Use the custom content if the admin has edited it
      // Note: You can parse the content or return standard rules
      return {
        rules: { userAgent: '*', allow: '/' },
        sitemap: `${SITE}/sitemap.xml`,
      };
    }
  } catch { /* fallthrough */ }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
```

---

## 6. Backup & Restore

SEO metadata and images are **independent of the main database**. 
- They are stored in `api/seo_data/` and `api/public/uploads/seo/`.
- You can create a dedicated SEO Backup (as a `.tar.gz` archive) from **SEO Management > Backup & Restore** or from the central **Backup Dashboard**.
- Restoring an SEO archive only affects your SEO data and assets, leaving the database untouched.

---

## 7. Performance & Static Generation

A common concern is whether dynamic SEO hampers speed compared to "hardcoded" values. 

### Why it's fast:
1. **ISR (Incremental Static Regeneration)**: By using `{ next: { revalidate: 3600 } }` in your `fetch` calls, Next.js caches the SEO data on the server. The visitor receives a **static HTML file** with the metadata already injected. 
2. **Backend HTTP Caching**: The API now includes `Cache-Control: public, max-age=3600` headers. This means even if your frontend cache misses, intermediate CDNs (like Vercel or Cloudflare) will serve the SEO data instantly.
3. **Zero Client-Side Lag**: Metadata is injected on the server, so the browser doesn't need to do any work to "compute" SEO.

---

## 8. Instant Load Strategy (Best Practices)

To ensure your pages always load instantly with zero SEO latency, follow this pattern:

### A. The "Single Fetch" Rule
Avoid calling `fetchPageSeo` multiple times in one render. Next.js deduplicates fetches, but for maximum clarity, fetch the data in a parent Layout or Page and pass it down.

### B. Shared Layout Scripts
Instead of fetching global scripts in every page, fetch them once in `app/layout.tsx`. This ensures scripts are "baked into" the initial HTML response.

### C. Predictive Prefetching
Since SEO is usually linked to the URL, you don't need to "wait" for the user to click. Next.js handles prefetching automatically for links, making the transition feel like an instant load.

### D. Revalidation vs. Real-time
- Use `revalidate: 3600` (1 hour) for 99% of pages.
- Use `revalidate: 60` (1 minute) only for high-frequency updates.
- If you need **instant** updates after saving in Admin, you can use a Webhook to trigger a `revalidatePath()` in Next.js.

```env
# .env.local (frontend)
NEXT_PUBLIC_API_URL=http://localhost:8000       # API server
NEXT_PUBLIC_SITE_URL=https://your-domain.com   # Your public domain
```
