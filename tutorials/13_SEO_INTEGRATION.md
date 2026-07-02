# SEO Integration Guide

NextAdmin provides a complete, file-based SEO management system. The Admin (port 7000) stores all configuration on the server; your public Next.js site (port 3000) fetches it at render time. No extra database queries on the frontend — everything is served as flat JSON with HTTP caching.

---

## How Data is Stored

```
api/
├── seo_data/
│   ├── global_settings.json       ← header/footer script snippets
│   ├── sitemap_config.json        ← sitemap rules, model URL patterns
│   ├── redirects.json             ← 301 redirect & 410 Gone rules
│   └── pages/
│       ├── home/
│       │   └── meta.json          ← SEO data for "/"
│       ├── about/
│       │   └── meta.json          ← SEO data for "/about"
│       └── services__web-design/  ← "/" in slug encoded as "__"
│           └── meta.json
└── public/
    └── uploads/seo/
        ├── about/
        │   ├── og-image.jpg
        │   └── twitter-image.png
        └── home/
            └── og-image.jpg
```

### Slug → Folder Mapping

| Frontend URL           | Admin slug             | Stored folder                |
|------------------------|------------------------|------------------------------|
| `/`                    | `home`                 | `pages/home/`                |
| `/about`               | `about`                | `pages/about/`               |
| `/services`            | `services`             | `pages/services/`            |
| `/services/web-design` | `services/web-design`  | `pages/services__web-design/`|

---

## Public API Endpoints

All endpoints are unauthenticated — call them directly from your Next.js site.

| Endpoint | Purpose |
|---|---|
| `GET /api/seo/head?slug=about` | Page meta (title, OG, Twitter, canonical, schema, noIndex, noFollow) |
| `GET /api/seo/scripts` | Global header/footer scripts |
| `GET /api/seo/robots-text` | Raw robots.txt content |
| `GET /api/seo/sitemap-data` | URL list for XML sitemap (static pages + model records) |
| `GET /api/seo/redirects` | All 301 and 410 rules |
| `GET /uploads/seo/{slug}/og-image.{ext}` | OG image static file |
| `GET /uploads/seo/{slug}/twitter-image.{ext}` | Twitter image static file |

---

## Environment Variables

```env
# .env.local  (your public Next.js site, port 3000)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

---

## 1. Shared SEO Helper

Create once, import everywhere:

```ts
// lib/seo.ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Fetch page SEO metadata.
 * Uses force-cache so the result is served from Next.js persistent disk cache
 * after the first request — same speed as reading a static file.
 * Use on-demand revalidation (Section 10) to push updates instantly.
 */
export async function fetchPageSeo(slug: string) {
  try {
    const res = await fetch(`${API}/api/seo/head?slug=${encodeURIComponent(slug)}`, {
      cache: 'force-cache',
      next: { tags: ['seo', `seo:${slug}`] },
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** Fetch sitemap frequency/priority configured in Admin → XML Sitemap. */
export async function fetchSitemapConfig() {
  try {
    const res = await fetch(`${API}/api/seo/sitemap-config`, { cache: 'force-cache', next: { tags: ['seo'] } });
    return res.ok ? res.json() : { frequency: 'weekly', priority: 0.8 };
  } catch {
    return { frequency: 'weekly', priority: 0.8 };
  }
}

/** Convert a stored relative path to a full API URL */
export function seoImageUrl(relativePath: string | undefined): string | undefined {
  if (!relativePath) return undefined;
  return `${API}${relativePath}`;
}
```

---

## 2. Static Page SEO

For pages like Home, About, Services — where the URL is fixed, not driven by a database record.

**Admin:** Go to **SEO Management → Page SEO → Add New Page** and enter the slug.

```tsx
// app/about/page.tsx
import type { Metadata } from 'next';
import { fetchPageSeo, seoImageUrl } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchPageSeo('about');

  if (!seo?.metaTitle) return { title: 'About Us' }; // fallback

  return {
    title: seo.metaTitle,
    description: seo.metaDescription,
    robots: [
      seo.noIndex  ? 'noindex'  : 'index',
      seo.noFollow ? 'nofollow' : 'follow',
    ].join(','),
    alternates: {
      canonical: seo.canonicalUrl || undefined, // full URL, e.g. https://example.com/about
    },
    openGraph: {
      type: seo.ogType || 'website',
      title: seo.ogTitle || seo.metaTitle,
      description: seo.ogDescription || seo.metaDescription,
      images: seo.ogImage ? [seoImageUrl(seo.ogImage)!] : [],
    },
    twitter: {
      card: seo.twitterCardType || 'summary_large_image',
      title: seo.twitterTitle || seo.metaTitle,
      description: seo.twitterDescription || seo.metaDescription,
      images: seo.twitterImage ? [seoImageUrl(seo.twitterImage)!] : [],
    },
  };
}

export default function AboutPage() {
  return <main>{/* page content */}</main>;
}
```

### 2.1 JSON-LD Structured Data

The Admin's **Schema (JSON-LD)** field lets you paste structured data per page. Inject it as a script tag in the page component:

```tsx
// app/about/page.tsx
import { fetchPageSeo } from '@/lib/seo';

async function JsonLd({ slug }: { slug: string }) {
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
      <JsonLd slug="about" />
      {/* page content */}
    </main>
  );
}
```

### 2.2 Field Fallback Reference

| Admin field left blank | Fallback to use |
|---|---|
| `ogTitle` | `metaTitle` |
| `ogDescription` | `metaDescription` |
| `ogImage` | omit `images` array |
| `twitterTitle` | `metaTitle` |
| `twitterDescription` | `metaDescription` |
| `twitterImage` | omit `images` array |
| `canonicalUrl` | omit `alternates.canonical` |

---

## 3. Blog Post SEO (Dynamic / DB-driven)

For database-driven content like blog posts, the SEO fields (`metaTitle`, `metaDescription`, `schema`) are stored directly on the model. The blog API route auto-generates the full `seo` object from the post's own fields.

**No Admin → SEO Management config needed for individual posts** — the data comes from the database record itself.

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getPost(slug: string) {
  const res = await fetch(`${API}/api/posts/${slug}`, { next: { revalidate: 3600 } });
  return res.ok ? res.json() : null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const result = await getPost(params.slug);
  const post = result?.data;
  const seo  = post?.seo;

  if (!post) return { title: 'Post Not Found' };

  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt || '',
    alternates: {
      canonical: seo?.canonicalUrl,
    },
    openGraph: {
      type: 'article',
      title: seo?.ogTitle || post.metaTitle || post.title,
      description: seo?.ogDescription || post.metaDescription || '',
      images: seo?.ogImage ? [`${API}${seo.ogImage}`] : [],
      publishedTime: post.publishedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo?.twitterTitle || post.metaTitle || post.title,
      description: seo?.twitterDescription || post.metaDescription || '',
      images: seo?.twitterImage ? [`${API}${seo.twitterImage}`] : [],
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const result = await getPost(params.slug);
  const post   = result?.data;

  if (!post) return <div>Post not found</div>;

  return (
    <article>
      {/* Inject JSON-LD schema if the author added one in Admin */}
      {post.schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: post.schema }}
        />
      )}
      <h1>{post.title}</h1>
      {/* render post content */}
    </article>
  );
}
```

### What the blog API returns

The `GET /api/posts/:id` and `GET /api/posts` (single post) responses include a computed `seo` object:

```json
{
  "data": {
    "id": 1,
    "title": "My Post",
    "slug": "my-post",
    "metaTitle": "Custom SEO Title",
    "metaDescription": "Custom description",
    "schema": "{ \"@context\": \"https://schema.org\", ... }",
    "seo": {
      "canonicalUrl": "https://yourdomain.com/blog/my-post",
      "ogTitle": "Custom SEO Title",
      "ogDescription": "Custom description",
      "ogImage": "/uploads/...",
      "twitterTitle": "Custom SEO Title",
      "twitterDescription": "Custom description",
      "twitterImage": "/uploads/..."
    }
  }
}
```

`metaTitle` and `metaDescription` are set in **Admin → Content → Blog Posts**. The `seo` fields auto-fall back to `title` and `excerpt` if left blank.

### Adding `schema` to the Blog Post form

The Admin model editor renders a dark code editor for any field named `schema`. Add it to your `BlogPost` model and it appears automatically:

```ts
// api/src/apps/blog/models.ts
schema = new TextField({ nullable: true });
```

---

## 4. Global Scripts

Inject analytics, tag managers, and verification codes site-wide. Managed from **Admin → SEO Management → Global Scripts**.

> **Do not** dump this HTML through `<div dangerouslySetInnerHTML>`. A `<meta>` (e.g. `google-site-verification`) written that way lands inside `<body>` as inert text — crawlers only read verification tags in `<head>`, so verification silently fails. React (19+) auto-hoists **real** `<meta>`/`<link>`/`<title>` JSX elements into `<head>`, so the fix is to parse the admin HTML into genuine tags. Scripts go through `next/script` so they actually execute.

Create a small server component that parses the free-form HTML (trusted admin input) into real tags:

```tsx
// components/GlobalScripts.tsx
import React from 'react';
import Script from 'next/script';

// HTML attribute name → React prop name for the few that differ.
const ATTR_MAP: Record<string, string> = {
  class: 'className', for: 'htmlFor', charset: 'charSet',
  'http-equiv': 'httpEquiv', crossorigin: 'crossOrigin',
  referrerpolicy: 'referrerPolicy', hreflang: 'hrefLang',
};

function parseAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (!m[1]) continue;
    const name = ATTR_MAP[m[1].toLowerCase()] ?? m[1];
    const value = m[2] ?? m[3] ?? m[4];
    attrs[name] = value === undefined ? true : value;
  }
  return attrs;
}

function parseHeadHtml(html: string) {
  const tags: React.ReactNode[] = [];
  const scripts: { key: string; attrs: Record<string, string | boolean>; inner: string }[] = [];
  let n = 0;

  // Extract <script>…</script> first (their content may contain '>').
  const rest = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_f, a: string, inner: string) => {
    scripts.push({ key: `gs-s${n++}`, attrs: parseAttrs(a), inner });
    return '';
  });

  let m: RegExpExecArray | null;
  const voidRe = /<(meta|link|base)\b([^>]*?)\/?>/gi;
  while ((m = voidRe.exec(rest)) !== null) {
    tags.push(React.createElement(m[1].toLowerCase(), { key: `gs-t${n++}`, ...parseAttrs(m[2]) }));
  }
  const titleRe = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi;
  while ((m = titleRe.exec(rest)) !== null) {
    tags.push(<title key={`gs-t${n++}`}>{m[1]}</title>);
  }
  return { tags, scripts };
}

export function GlobalScripts({
  html, strategy,
}: {
  html: string | undefined | null;
  strategy: 'beforeInteractive' | 'afterInteractive';
}) {
  if (!html || !html.trim()) return null;
  const { tags, scripts } = parseHeadHtml(html);
  return (
    <>
      {tags /* meta/link/title → hoisted into <head> by React */}
      {scripts.map((s) =>
        s.attrs.src
          ? <Script key={s.key} strategy={strategy} {...s.attrs} />
          : <Script key={s.key} id={s.key} strategy={strategy} dangerouslySetInnerHTML={{ __html: s.inner }} />,
      )}
    </>
  );
}
```

Then wire it into the root layout:

```tsx
// app/layout.tsx
import { GlobalScripts } from '@/components/GlobalScripts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getGlobalScripts() {
  try {
    const res = await fetch(`${API}/api/seo/scripts`, {
      cache: 'force-cache',
      next: { tags: ['seo'] },
    });
    return res.ok ? res.json() : { headerScripts: '', footerScripts: '' };
  } catch {
    return { headerScripts: '', footerScripts: '' };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { headerScripts, footerScripts } = await getGlobalScripts();

  return (
    <html lang="en">
      <body>
        <GlobalScripts html={headerScripts} strategy="beforeInteractive" />
        {children}
        <GlobalScripts html={footerScripts} strategy="afterInteractive" />
      </body>
    </html>
  );
}
```

**Typical use cases:** Google Analytics `<script>`, Google Tag Manager snippet, Search Console meta verification tag, Facebook Pixel. Verification `<meta>` tags now hoist into `<head>` correctly; scripts run via `next/script`.

---

## 5. Redirects (301 & 410)

Managed from **Admin → SEO Management → Redirects**. Apply them in `middleware.ts` so they run before any page renders — no page component code needed.

```ts
// middleware.ts  (root of your Next.js project)
import { NextResponse, type NextRequest } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

let rulesCache: { from: string; to: string; type: 301 | 410 }[] = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

async function getRules() {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) return rulesCache;
  try {
    const res = await fetch(`${API}/api/seo/redirects`);
    if (res.ok) {
      rulesCache = await res.json();
      cacheLoadedAt = Date.now();
    }
  } catch { /* keep stale cache on network error */ }
  return rulesCache;
}

export async function middleware(request: NextRequest) {
  const rules    = await getRules();
  const pathname = request.nextUrl.pathname;
  const match    = rules.find(r => r.from === pathname);

  if (!match) return NextResponse.next();
  if (match.type === 301) return NextResponse.redirect(new URL(match.to, request.url), 301);
  if (match.type === 410) return new NextResponse(null, { status: 410 });

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

| Rule type | Effect |
|---|---|
| **301** | Browser and search engines follow the redirect permanently |
| **410** | Tells search engines the page is permanently gone — removes it from the index |

Rules are memory-cached for 60 seconds. New rules take effect within one minute without a deploy.

---

## 6. XML Sitemap

Configure from **Admin → SEO Management → XML Sitemap**. The API returns a flat list of URL paths — your `app/sitemap.ts` prepends your domain.

```ts
// app/sitemap.ts
import { MetadataRoute } from 'next';
import { fetchSitemapConfig } from '@/lib/seo';

const API  = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:8000';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [urlsRes, config] = await Promise.all([
    fetch(`${API}/api/seo/sitemap-data`, { cache: 'force-cache', next: { tags: ['seo'] } }),
    fetchSitemapConfig(),
  ]);

  const urls: string[] = urlsRes.ok ? await urlsRes.json() : [];

  return urls.map(url => ({
    url: `${SITE}${url}`,
    lastModified: new Date(),
    changeFrequency: config.frequency as MetadataRoute.Sitemap[0]['changeFrequency'],
    priority: config.priority,
  }));
}
```

### What gets included

| Source | How to configure |
|---|---|
| Static page SEO slugs | Automatically included when you add a page in **Page SEO** tab |
| Manual static paths | **Sitemap → Advanced → Static Paths** |
| Database model records | **Sitemap → Model URL Patterns** (see below) |
| Excluded URLs | **Sitemap → Advanced → Excluded URLs** |

### Model URL Patterns

To include blog posts, products, or any other model records, add a pattern in **Admin → XML Sitemap → Model URL Patterns**:

| Field | Example | Description |
|---|---|---|
| Model | `BlogPost` | The registered model name |
| Slug field | `slug` | The field whose value becomes the URL segment |
| URL prefix | `/blog` | Prepended to the slug value |

A `BlogPost` with `slug = "my-post"` and prefix `/blog` produces `/blog/my-post` in the sitemap.

---

## 7. Robots.txt

Served from **Admin → SEO Management → Robots.txt**. Use a route handler to serve the exact saved content:

```ts
// app/robots.txt/route.ts
const API  = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:8000';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

export async function GET() {
  try {
    const res = await fetch(`${API}/api/seo/robots-text`, { next: { revalidate: 3600 } });
    const { content } = await res.json();
    if (content) return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
  } catch { /* fallthrough */ }

  return new Response(
    `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml`,
    { headers: { 'Content-Type': 'text/plain' } }
  );
}
```

> Do not create `app/robots.ts` alongside this file — they conflict.

**Default robots.txt to configure in Admin:**

```
User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /api/
Sitemap: https://your-domain.com/sitemap.xml
```

---

## 8. Backup & Restore

SEO data is stored independently of the main database — safe to move between environments.

- All data lives in `api/seo_data/` and `api/public/uploads/seo/`
- Create a `.tar.gz` archive from **Admin → SEO Management → Backup & Restore**
- Optionally upload directly to Google Drive (configure in **Settings → Backup**)
- Restoring overwrites only SEO files — database and user accounts are untouched

---

## 9. Performance Reference

| Concern | How it's handled |
|---|---|
| Page load speed | `cache: 'force-cache'` — Next.js serves SEO data from persistent disk cache, zero API calls |
| Cache invalidation | On-demand revalidation via `revalidateTag('seo')` — updates appear instantly on next request |
| CDN caching | API responds with `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` |
| Redirect latency | Rules memory-cached in `middleware.ts` — zero API calls per request during TTL |
| Blog post SEO | Fetched alongside post content in a single API call — no extra round trip |
| Missing config | Always provide hardcoded fallback `title`/`description` so the page is never empty |

---

## 10. Static Build & On-Demand Revalidation

`cache: 'force-cache'` makes `fetchPageSeo` behave like a static file read — the result is stored in Next.js's persistent cache on first fetch and served instantly on every subsequent request without hitting the API. Pages are effectively static.

The tradeoff: when you save SEO in the Admin, the cached version stays until you invalidate it. On-demand revalidation solves this — it tells Next.js to drop specific cache entries the moment data changes.

### Step 1 — Revalidation route in your public Next.js site

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  if (searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const tag = searchParams.get('tag') || 'seo';
  revalidateTag(tag);
  return NextResponse.json({ revalidated: true, tag });
}
```

Add to `.env.local` in your public site:

```env
REVALIDATE_SECRET=your-random-secret-here
```

### Step 2 — Call the route from the API server after SEO saves

Add to `.env` in your API (`api/.env`):

```env
NEXTJS_SITE_URL=https://your-public-site.com
REVALIDATE_SECRET=your-random-secret-here
```

The API automatically calls your revalidation endpoint whenever page SEO, global scripts, or sitemap config is updated. No extra wiring needed — it's built into the SEO routes.

### What gets revalidated

| Admin action | Cache tag cleared |
|---|---|
| Save page SEO for `/about` | `seo:about` + `seo` |
| Save global scripts | `seo` |
| Save sitemap config | `seo` |
| Save robots.txt | `seo` |

### Without a webhook (simpler setup)

If you prefer not to configure the webhook, use `revalidate: 3600` instead of `cache: 'force-cache'`:

```ts
// lib/seo.ts — simple version, no webhook needed
export async function fetchPageSeo(slug: string) {
  const res = await fetch(`${API}/api/seo/head?slug=${encodeURIComponent(slug)}`, {
    next: { revalidate: 3600 },  // re-fetch at most every hour
  });
  return res.ok ? res.json() : null;
}
```

This is still very fast (cached for 1 hour) but SEO changes take up to 1 hour to appear. Reduce to `revalidate: 60` for 1-minute freshness.

---

## 11. Complete File Checklist

| File | Purpose |
|---|---|
| `lib/seo.ts` | Shared helper — `fetchPageSeo`, `fetchSitemapConfig`, `seoImageUrl` |
| `app/layout.tsx` | Inject global header/footer scripts |
| `app/api/revalidate/route.ts` | On-demand cache invalidation webhook (optional) |
| `app/robots.txt/route.ts` | Serve Admin-managed robots.txt |
| `app/sitemap.ts` | Build XML sitemap from API URL list + config |
| `middleware.ts` | Apply 301 redirects and 410 Gone rules |
| `app/about/page.tsx` | Example static page with `generateMetadata` |
| `app/blog/[slug]/page.tsx` | Example dynamic page with post SEO + JSON-LD |
