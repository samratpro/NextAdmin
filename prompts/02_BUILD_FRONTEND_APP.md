# AI Prompt: Build Stunning Public Frontend Consuming NextAdmin

Copy the prompt block below and paste it into your AI coding assistant to design a premium, highly responsive user-facing React/Next.js application that integrates with the NextAdmin API.

---

```text
Act as a world-class frontend engineer and UI/UX designer.

I want to build a stunning, premium, and state-of-the-art public frontend website that connects to my NextAdmin Fastify API backend (which runs on port 8000 by default).

Features of the Public App:
- App Name/Niche: "[APP_NICHE_OR_PRODUCT_DESCRIPTION]" (e.g. Creative Portfolio, SaaS Landing Page, E-commerce Store)
- Key Page Sections: [LIST_OF_SECTIONS] (e.g. Hero banner, Model Grid List, Features, Interactive Booking Form)
- Desired Aesthetic: [THEME_VIBE] (e.g. Dark Mode Glassmorphism, Sleek Minimalist, Vibrant Neobrutalism)

Please implement the following React components and logic:

1. API Integration Hook (`useApi.ts` / Axios Client):
   - Configured with `NEXT_PUBLIC_API_URL` pointing to `http://localhost:8000`.
   - Setup global headers supporting `Authorization: Bearer <JWT_TOKEN>` for protected routes.
   - Leverages localStorage or cookies for token refreshing and JWT state.

2. Auth Screens (Login, Register):
   - Beautiful forms designed with premium aesthetics (Google Fonts, custom input inputs, smooth micro-animations, clear validation errors).
   - Hooked to `POST /auth/login` and `POST /auth/register`.

3. Dynamic Page View:
   - Fetches and displays data from `/api/admin/models/[MODEL_NAME]/data` or custom endpoints.
   - Includes custom grids, loading skeleton states, empty list templates, and interactive pagination/sorting.

4. High-Performance SEO Integration:
   - Implement `lib/seo.ts` using `fetchPageSeo(slug)` calling `GET /api/seo/head?slug=<slug>` (Next.js Cache Revalidation `3600`s).
   - Implement `generateMetadata` inside static routes using returned API attributes (`metaTitle`, `metaDescription`, `canonicalUrl`, OpenGraph `ogTitle`/`ogDescription`/`ogImage`, Twitter card configurations, `noIndex`, `noFollow`).
   - Implement dynamic DB-driven metadata parsing for models (e.g. blog posts), leveraging computed JSON `seo` objects returned inside standard endpoint GET payloads.
   - Support JSON-LD structured schemas by injecting a `<script type="application/ld+json">` tag when the custom `schema` field is present in page or model configurations.

5. Site-wide Scripts & Integrations:
   - Fetch header/footer integration scripts in `app/layout.tsx` from `GET /api/seo/scripts`.
   - Render header scripts inside `<head>` and footer scripts at the end of `<body>` via `dangerouslySetInnerHTML` for zero-friction analytics installations (e.g., Google Analytics, Tag Manager).

6. Automated 301 Redirects & 410 Gone Middleware:
   - Setup `middleware.ts` loading rules from `GET /api/seo/redirects` (with a 60-second in-memory caching TTL).
   - Automatically redirect matches with 301 codes, or return a 410 Gone status to immediately remove deprecated paths from search engines.

7. Dynamic XML Sitemap & Robots.txt Routes:
   - Setup `app/sitemap.ts` calling `GET /api/seo/sitemap-data` to dynamically populate all static, manual, and model-driven URL records, prepending the public domain.
   - Setup `app/robots.txt/route.ts` calling `GET /api/seo/robots-text` to dynamically serve administrative crawler rules.

8. Design Specifications:
   - Prioritize high visual excellence: Sleek CSS gradients, smooth transitions (`transition-all duration-300`), tailwind or vanilla HSL curated colors, responsive layouts, and interactive hover scales.
   - Absolutely no dry or generic layouts. Impress the user at first glance.
```
