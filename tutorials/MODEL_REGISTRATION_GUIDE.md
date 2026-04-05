# Model Registration Guide

This guide explains the full path from "I want a model" to "I can manage it in the admin and use it in my app".

In Nango, those are separate steps:

1. create the app folder
2. define the model
3. import the model in `api/src/index.ts`
4. register routes for your public API
5. restart the API
6. use the model in the admin if it is registered with `@registerAdmin(...)`

## The Most Important Rule

Defining a model class is not enough by itself.

For a model to matter in practice, you need to wire it into the API runtime explicitly.

## What `startapp` Gives You

Run:

```bash
cd api
npm run startapp blog
```

That creates:

- `api/src/apps/blog/models.ts`
- `api/src/apps/blog/service.ts`
- `api/src/apps/blog/routes.ts`
- `api/src/apps/blog/index.ts`

The generated app is only a starting point. You still need to wire it into `api/src/index.ts`.

## End-to-End Example

Let's build a `BlogPost` model that:

- appears in the admin
- stores data in the database
- is available from a public API route

### Step 1: Create the App

```bash
cd api
npm run startapp blog
```

### Step 2: Define the Model

Edit `api/src/apps/blog/models.ts`:

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

### Step 3: Add Public API Routes

Edit `api/src/apps/blog/routes.ts`:

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

  fastify.get('/api/posts/:id', {
    schema: {
      tags: ['Blog'],
      description: 'Get a single blog post'
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = BlogPost.objects.get<BlogPost>({ id: parseInt(id, 10) });

    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }

    return { data: post };
  });
}
```

### Step 4: Wire the App Into the API

Edit `api/src/index.ts` and add:

```typescript
import './apps/blog/models';
import blogRoutes from './apps/blog/routes';
```

Then register the routes inside `start()`:

```typescript
await fastify.register(blogRoutes);
```

## What Happens After Restart

When the API restarts:

1. `import './apps/blog/models'` runs
2. `@registerAdmin(...)` registers the model with the admin registry
3. startup creates the table for imported admin-registered models
4. default model permissions are created
5. the model appears in the admin
6. your custom routes become available

## What `@registerAdmin(...)` Actually Does

`@registerAdmin(...)` does three practical things:

1. makes the model visible to the admin system
2. gives the admin UI metadata such as display name, list columns, and filters
3. allows startup to auto-create the table and default permissions for that imported model

It does not create public API routes for you. Those remain explicit.

## Custom Table Names

If you define `getTableName()`, that name becomes the table name in the database.

Use custom table names when:

- you want predictable snake_case names
- you are matching an existing schema
- you do not want the default pluralization behavior

## Relationships

Use `ForeignKey` when one model references another.

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

## `ForeignKey` vs `relatedFields`

There are two valid ways to represent relationships in Nango admin.

### Use `ForeignKey` when the ORM relationship is real

Use `ForeignKey(...)` when the field should be treated as a true model relationship at the schema level.

Example:

```typescript
import { Model } from '../../core/model';
import { CharField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'Content',
  displayName: 'Categories',
  listDisplay: ['id', 'name']
})
export class Category extends Model {
  static getTableName(): string {
    return 'blog_categories';
  }

  name = new CharField({ maxLength: 100 });
}

@registerAdmin({
  appName: 'Content',
  displayName: 'Posts',
  listDisplay: ['id', 'title', 'categoryId']
})
export class Post extends Model {
  static getTableName(): string {
    return 'blog_posts';
  }

  title = new CharField({ maxLength: 255 });
  categoryId = new ForeignKey('Category', {
    relatedTable: 'blog_categories',
    onDelete: 'CASCADE'
  });
}
```

Use this when:

- the field really is a relational foreign key
- you want schema-level relationship metadata
- you want the admin to recognize the field automatically as a relation

### Use `relatedFields` when the stored field is still a plain integer ID

Some apps already store relations as plain integer fields like `userId`, `projectId`, `appId`, or `createdById`.

In that case, you do not have to refactor the field into `ForeignKey(...)` just to make admin rendering nicer.

You can keep the field as `IntegerField` and tell the admin how to treat it:

```typescript
import { Model } from '../../core/model';
import { CharField, IntegerField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'SEO',
  displayName: 'On-Page Records',
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'keywordPicked'],
  searchFields: ['keywordPicked'],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User'
  }
})
export class OnPageRecord extends Model {
  static getTableName(): string {
    return 'seo_on_page';
  }

  seoProjectId = new IntegerField();
  recordDate = new CharField({ maxLength: 50 });
  keywordPicked = new CharField({ maxLength: 255 });
  createdById = new IntegerField();
}
```

Use this when:

- the database field already exists as an integer ID
- you want admin dropdowns and labels without changing the schema shape
- the field is relation-like in admin, even if the ORM field is not a true `ForeignKey`

## How the Admin Uses Relation Metadata

When relation metadata is available through either:

- `ForeignKey(...)`
- or `@registerAdmin({ relatedFields: { ... } })`

the admin can:

- render relation dropdowns in forms
- show human-readable relation labels in list views
- avoid showing only raw IDs when related model data is available

In practice, the admin tries to label related objects using useful fields such as:

- `name`
- `title`
- `username`
- `displayName`
- `clientName`
- `mainTopicName`
- `slug`
- `websiteUrl`
- `email`
- `url`

If none of those exist, it falls back to a model-and-id label such as `User #3`.

## Recommendation

Use this rule of thumb:

- choose `ForeignKey` for real model relationships
- choose `relatedFields` for legacy or intentionally plain integer ID columns that should still behave like relations in the admin

That keeps Nango explicit while still giving the admin enough metadata to render useful labels.

## Common Admin Options

```typescript
@registerAdmin({
  appName: 'Catalog',
  displayName: 'Products',
  icon: 'package',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'price'],
  searchFields: ['name', 'description'],
  filterFields: ['isActive'],
  excludeFields: ['internalNotes']
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

## Admin Model vs API-Only Model

If a model should be manageable in the admin, use `@registerAdmin(...)`.

If a model is API-only and you do not register it for admin:

- it will not appear in the admin
- it will not be auto-created through the admin registry startup path
- you should create its table explicitly in startup code

That is part of Nango's explicit design.

## Troubleshooting

### Model does not appear in admin

Check:

1. the model has `@registerAdmin(...)`
2. the model file is imported in `api/src/index.ts`
3. the API server was restarted
4. you are logged into the admin as a superuser or a staff user with the right permissions

### Public route returns 404

Check:

1. `routes.ts` exists
2. the routes were registered in `api/src/index.ts`
3. the API server was restarted

### Table does not exist

Check:

1. the model file is imported in `api/src/index.ts`
2. the model is registered with `@registerAdmin(...)`, or you created its table manually
3. you are pointing at the expected database file

## Recommended Mental Model

In Nango, a model has three separate concerns:

- data definition
- admin registration
- public API exposure

Keeping those concerns explicit is one of the framework's core ideas.
