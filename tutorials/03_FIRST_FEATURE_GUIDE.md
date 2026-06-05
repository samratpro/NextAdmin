# First Feature Guide

This is the fastest end-to-end path for building something real in NextAdmin.

Goal:

- create a backend app
- define a model
- expose public API routes
- manage the model from the admin
- fetch the data from a user-facing frontend

We will use a simple blog-style example.

## Final Result

At the end, you will have:

- a `BlogPost` model in `api/src/apps/blog/models.ts`
- public routes like `GET /api/posts`
- a model visible in the admin
- a public app that can fetch posts from the API

## Step 1: Create the App

```bash
cd api
npm run startapp blog
```

That scaffolds:

- `models.ts`
- `service.ts`
- `routes.ts`
- `index.ts`

## Step 2: Define the Model

Replace `api/src/apps/blog/models.ts` with:

```typescript
import { Model } from '../../core/model';
import { CharField, TextField, BooleanField, DateTimeField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'Content',
  displayName: 'Blog Posts',
  icon: 'file-text',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['title', 'published', 'createdAt'],
  searchFields: ['title', 'content'],
  filterFields: ['published']
})
export class BlogPost extends Model {
  static getTableName(): string {
    return 'blog_posts';
  }

  title = new CharField({ maxLength: 255 });
  slug = new CharField({ maxLength: 255, unique: true });
  content = new TextField();
  published = new BooleanField({ default: false });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });
}
```

## Step 3: Add Public Routes

Replace `api/src/apps/blog/routes.ts` with:

```typescript
import { FastifyInstance } from 'fastify';
import { BlogPost } from './models';

export default async function blogRoutes(fastify: FastifyInstance) {
  fastify.get('/api/posts', {
    schema: {
      tags: ['Blog'],
      description: 'List published blog posts'
    }
  }, async () => {
    const all = await BlogPost.objects.all<BlogPost>()
      .orderBy('id', 'DESC')
      .all();
    const posts = all.filter((post: any) => post.published);
    return { data: posts };
  });

  fastify.post('/api/posts', {
    schema: {
      tags: ['Blog'],
      description: 'Create a blog post'
    }
  }, async (request, reply) => {
    const post = await BlogPost.objects.create(request.body as any);
    return reply.code(201).send({ data: post });
  });
}
```

## Step 4: Start the API

```bash
cd api
npm run dev
```

Because of the **Auto-Discovery Engine**, your model and routes are automatically loaded!
Because the model was registered with `@registerAdmin(...)`:

- its table will be created on startup
- default admin permissions will be created
- the admin can discover it
- the fastify plugin exported in `routes.ts` is automatically registered

## Step 5: Create an Admin User

```bash
cd api
npm run createsuperuser
```

Then run the admin app:

```bash
cd admin
npm run dev
```

Open:

- Admin: `http://localhost:7000`
- API docs: `http://localhost:8000/docs`

After logging in, you should see `Blog Posts` in the admin sidebar.

## Step 6: Test the Public API

Example requests:

```bash
curl http://localhost:8000/api/posts
```

```bash
curl -X POST http://localhost:8000/api/posts ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Hello\",\"slug\":\"hello\",\"content\":\"First post\",\"published\":true}"
```

## Step 7: Fetch It From Your Public App

Example frontend request:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const response = await fetch(`${API_URL}/api/posts`);
const result = await response.json();

console.log(result.data);
```

## Step 8: Populating Initial Data (Database Seeding)

To make developer onboarding or local environment setup plug-and-play, NextAdmin features an **Auto-Discovery Seeder Engine**. 

If a file named `seed.ts` or `seed.js` is found directly inside your modular app directory (e.g., `api/src/apps/[appName]/seed.ts`), the framework will dynamically import it on startup and run its default exported function.

### Writing a Custom Seeder

Create a file named `api/src/apps/blog/seed.ts` to populate initial data:

```typescript
import { BlogPost } from './models';
import logger from '../../core/logger';

export default async function seedBlog() {
  logger.info('Checking if Blog app needs seeding...');

  // 1. Prevent duplicate seeding
  const count = await BlogPost.objects.count();
  if (count > 0) {
    logger.info('Blog app already has posts, skipping seeding.');
    return;
  }

  logger.info('Seeding sample blog data...');

  // 2. Instantiate and save models
  const post = new BlogPost() as any;
  post.title = 'Getting Started with NextAdmin';
  post.slug = 'getting-started-with-nextadmin';
  post.content = 'This post was automatically populated by the NextAdmin Seeder!';
  post.published = true;
  await post.save();

  logger.info('✓ Seeding complete: Getting Started with NextAdmin');
}
```

Every time you launch the backend API server with `npm run dev`, it will:
1. Initialize the SQLite database.
2. Scan all app directories.
3. Automatically execute your `seedBlog()` export if the model table is empty!

## Step 9: Understand the Split

The intended architecture is:

```text
Public App  ----\
                 >---- API ---- Database
Admin Panel ----/
```

That means:

- admin users manage records in the admin UI
- end users use your product frontend
- both frontends rely on the same API and data

## Step 10: Production Checklist

For production, make sure:

- `CORS_ORIGIN` includes the public app and admin origins
- `FRONTEND_URL` points to the public app
- `NEXT_PUBLIC_API_URL` points both frontends to the API
- you understand that SQLite is the supported production database today

## Where to Go Next

- For deeper model details: [MODEL_REGISTRATION_GUIDE.md](./MODEL_REGISTRATION_GUIDE.md)
- For public frontend auth and token flow: [PUBLIC_APP_INTEGRATION.md](./PUBLIC_APP_INTEGRATION.md)
- For deployment: [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
