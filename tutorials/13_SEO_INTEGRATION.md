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

export async function fetchPageSeo(slug: string) {
  try {
    const res = await fetch(`${API}/api/seo/head?slug=${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
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
          <div dangerouslySetInnerHTML={{ __html: headerScripts }} />
        )}
      </head>
      <body>
        {children}
        {footerScripts && (
          <div dangerouslySetInnerHTML={{ __html: footerScripts }} />
        )}
      </body>
    </html>
  );
}
```

**Typical use cases:** Google Analytics `<script>`, Google Tag Manager snippet, Search Console meta verification tag, Facebook Pixel.

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

const API  = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:8000';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const res  = await fetch(`${API}/api/seo/sitemap-data`, { next: { revalidate: 3600 } });
  const urls: string[] = res.ok ? await res.json() : [];

  return urls.map(url => ({
    url: `${SITE}${url}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
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
| Page load speed | `next: { revalidate: 3600 }` — Next.js caches the fetch result for 1 hour |
| CDN caching | API responds with `Cache-Control: public, max-age=3600` |
| Redirect latency | Rules memory-cached in `middleware.ts` — zero API calls per request during TTL |
| Blog post SEO | Fetched alongside post content in a single API call — no extra round trip |
| Missing config | Always provide hardcoded fallback `title`/`description` so the page is never empty |

---

## 10. Complete File Checklist

| File | Purpose |
|---|---|
| `lib/seo.ts` | Shared helper — `fetchPageSeo`, `seoImageUrl` |
| `app/layout.tsx` | Inject global header/footer scripts |
| `app/robots.txt/route.ts` | Serve Admin-managed robots.txt |
| `app/sitemap.ts` | Build XML sitemap from API URL list |
| `middleware.ts` | Apply 301 redirects and 410 Gone rules |
| `app/about/page.tsx` | Example static page with `generateMetadata` |
| `app/blog/[slug]/page.tsx` | Example dynamic page with post SEO + JSON-LD |
