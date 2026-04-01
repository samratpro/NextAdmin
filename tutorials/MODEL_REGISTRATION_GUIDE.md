# Model Registration Guide

This guide explains how models become active in Nango and how they connect to the admin UI.

In this framework, defining a class is only part of the story. A model becomes useful when it is:

1. defined in an app
2. imported by the API entry point
3. optionally registered for the admin UI

## The Model Lifecycle

For a model to matter in practice:

1. create it in `api/src/apps/<appName>/models.ts`
2. add `@registerAdmin(...)` if you want it in the admin
3. import the model module from `api/src/index.ts`
4. restart the API so the table can be created if it does not already exist

## Quick Example

Create an app:

```bash
cd api
npm run startapp blog
```

Then define a model in `api/src/apps/blog/models.ts`:

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

Register the model module in `api/src/index.ts`:

```typescript
import './apps/blog/models';
```

After restarting the API:

- the table can be created automatically if it does not exist yet
- the model appears in the admin sidebar
- the admin can use the metadata from `@registerAdmin(...)`

## What `@registerAdmin(...)` Does

The decorator does not create routes by itself. It provides admin metadata such as:

- display name
- app grouping
- icon
- list columns
- search fields
- filter fields
- permission labels

Think of it as admin registration plus UI configuration.

## Relationships

Use `ForeignKey` when a model should reference another model.

Example:

```typescript
import { Model } from '../../core/model';
import { CharField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'Content',
  displayName: 'Categories',
  listDisplay: ['id', 'name', 'slug']
})
export class Category extends Model {
  static getTableName(): string {
    return 'blog_categories';
  }

  name = new CharField({ maxLength: 100 });
  slug = new CharField({ maxLength: 100, unique: true });
}

@registerAdmin({
  appName: 'Content',
  displayName: 'Blog Posts',
  listDisplay: ['id', 'title', 'category']
})
export class BlogPost extends Model {
  static getTableName(): string {
    return 'blog_posts';
  }

  title = new CharField({ maxLength: 255 });
  category = new ForeignKey('Category', {
    onDelete: 'CASCADE'
  });
}
```

## Custom Table Names

If you define `getTableName()`, that custom name becomes the source of truth.

Use custom table names when:

- you want stable table naming
- you want snake_case tables
- you want compatibility with an existing schema

## Common Admin Options

```typescript
@registerAdmin({
  appName: 'Catalog',
  displayName: 'Products',
  icon: 'package',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'price'],
  searchFields: ['name', 'description'],
  filterFields: ['isActive']
})
```

## Field Types

| Field | Use For |
| --- | --- |
| `CharField` | short text |
| `TextField` | long text |
| `IntegerField` | integers |
| `FloatField` | decimal-like numeric values |
| `BooleanField` | true/false state |
| `DateTimeField` | timestamps |
| `DateField` | date-only values |
| `EmailField` | email addresses |
| `ForeignKey` | model relationships |

## Routes Are Still Explicit

Registering a model for admin does not replace API route design.

If you want custom endpoints for your public frontend, define them in `routes.ts`.

Example:

```typescript
import { FastifyInstance } from 'fastify';
import { BlogPost } from './models';

export default async function blogRoutes(fastify: FastifyInstance) {
  fastify.get('/api/posts', async () => {
    return BlogPost.objects.all().all();
  });
}
```

Then register the routes in `api/src/index.ts`.

## Troubleshooting

### Model does not appear in admin

Check these first:

1. the model has `@registerAdmin(...)`
2. the model file is imported in `api/src/index.ts`
3. the API server was restarted

### Table does not exist

Check:

1. the model module was imported before startup completed
2. the SQLite database path is what you expect
3. you are not assuming automatic schema updates for existing tables

## Recommended Mental Model

In Nango, a model has three separate concerns:

- data definition
- admin registration
- API exposure

Keeping those concerns separate is part of the framework's loose-coupling approach.
