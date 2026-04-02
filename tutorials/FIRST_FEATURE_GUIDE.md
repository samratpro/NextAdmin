# First Feature Guide

This is the fastest end-to-end path for building something real in Nango.

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
  listDisplay: ['id', 'title', 'published', 'createdAt'],
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
    const posts = BlogPost.objects.all<BlogPost>()
      .orderBy('id', 'DESC')
      .all()
      .filter((post: any) => post.published);

    return { data: posts };
  });

  fastify.post('/api/posts', {
    schema: {
      tags: ['Blog'],
      description: 'Create a blog post'
    }
  }, async (request, reply) => {
    const post = BlogPost.objects.create(request.body as any);
    return reply.code(201).send({ data: post });
  });
}
```

## Step 4: Register the Model and Routes

Edit `api/src/index.ts` and add:

```typescript
import './apps/blog/models';
import blogRoutes from './apps/blog/routes';
```

Then register the routes:

```typescript
await fastify.register(blogRoutes);
```

## Step 5: Start the API

```bash
cd api
npm run dev
```

Because the model was imported and registered with `@registerAdmin(...)`:

- its table will be created on startup
- default admin permissions will be created
- the admin can discover it

## Step 6: Create an Admin User

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

## Step 7: Test the Public API

Example requests:

```bash
curl http://localhost:8000/api/posts
```

```bash
curl -X POST http://localhost:8000/api/posts ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Hello\",\"slug\":\"hello\",\"content\":\"First post\",\"published\":true}"
```

## Step 8: Fetch It From Your Public App

Example frontend request:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const response = await fetch(`${API_URL}/api/posts`);
const result = await response.json();

console.log(result.data);
```

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
