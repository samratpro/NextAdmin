# AI Prompt: Customize Admin Dashboard Panel and Metrics

Copy the prompt block below and paste it into your AI coding assistant to create customized stats panels, charts, activity feeds, and model analytics within the NextAdmin panel.

---

```text
Act as a seasoned Next.js and Tailwind engineer specializing in admin panels and dashboard design.

I want to add custom KPI stat cards, interactive charts, and dashboard feeds to my NextAdmin panel page: `admin/src/app/dashboard/page.tsx`.

Here are the custom dashboard metrics I need to compute and render:
1. Stats Cards: [LIST_OF_CARDS] (e.g. Total Active Users, Backup Health Status, SEO Pages crawled, Sales Volume)
2. Interactive Charts: [LIST_OF_CHARTS] (e.g. Monthly registration curves, backup success rates bar chart)
3. Dynamic Feeds: [LIST_OF_FEEDS] (e.g. Recent database edits audit trail, recent backups)

Please write the complete code matching these exact framework layouts:

- Part 1: Backend Metrics API Route (`api/src/apps/admin/routes.ts` or custom route file `api/src/apps/[app]/routes.ts`)
  - Export a default Fastify plugin containing the endpoint `GET /api/admin/dashboard-stats`.
  - Perform high-performance SQLite queries using our custom ORM models or database manager adapters:
    ```ts
    import DatabaseManager from '../../core/database';
    const db = DatabaseManager.getAdapter();
    const result = await db.all('SELECT ...');
    ```

- Part 2: Frontend Dashboard View (`admin/src/app/dashboard/page.tsx`)
  - Keep the component as a `'use client';` file.
  - Import the standard dynamic client state and API wrappers:
    ```tsx
    import { useAuthStore } from '@/store/authStore';
    import { useRouter } from 'next/navigation';
    import { useEffect, useState } from 'react';
    import { api } from '@/lib/api';
    ```
  - Fetch dashboard-stats in a `useEffect` using `api.get('/api/admin/dashboard-stats')`.
  - Design premium executive stats cards with custom SVG icons, hover micro-animations, and glassmorphic layouts.
  - Implement dynamic SVGs or custom React components to visualize chart plots.
  - Maintain superuser authorization checks where needed (`user?.isSuperuser ? (...) : null`).
```

