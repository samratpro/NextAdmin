# NextAdmin

NextAdmin is a Django-inspired full-stack framework for Node.js that keeps the productive parts of Django while using a more decoupled architecture.

Instead of tightly coupling templates, admin, routing, and backend logic into one runtime, NextAdmin separates concerns clearly:

- `api/` contains the backend, ORM, auth, and CLI tools.
- `admin/` is a dedicated Next.js admin application.
- your public frontend can live separately and talk to the API on its own terms.

The goal is not to clone Django line-for-line. The goal is to offer a familiar app-oriented workflow with looser coupling, clearer boundaries, and practical engineering defaults.

## Why NextAdmin

- Django-style apps for organizing backend features
- a custom lightweight ORM for fast iteration with SQLite
- a standalone admin app instead of a backend-rendered admin
- JWT-based authentication out of the box
- Swagger/OpenAPI docs for backend endpoints
- TypeScript across the stack

## Architecture at a Glance

| Directory | Responsibility |
| --- | --- |
| `api/` | Fastify API, auth, ORM, CLI commands, database access |
| `admin/` | Next.js admin interface for managing registered models |
| `tutorials/` | Guides, architecture notes, and implementation walkthroughs |

Default local ports:

- API: `http://localhost:8000`
- Admin: `http://localhost:7000`
- Public app: `http://localhost:3000` if you build one alongside this repo

## How the Admin Fits With Your App

NextAdmin is intentionally split into separate layers:

- `api/` is the shared backend
- `admin/` is the internal management UI
- your public app is a separate frontend for end users

This means the admin is not meant to be embedded into the user-facing app.

Instead, the intended shape is:

```text
Public App  ----\
                 >---- API ---- Database
Admin Panel ----/
```

In practice:

- admins and staff use `admin/`
- end users use your own frontend
- both frontends talk to the same backend API

If you are looking for "how to integrate the admin with the user's app", the answer in NextAdmin is usually:

1. keep the admin separate
2. point both frontends at the same API
3. let the admin manage data
4. expose product-specific routes from `api/` for the public app

For the full step-by-step guide, see [Public App Integration](./tutorials/PUBLIC_APP_INTEGRATION.md).

## Day-One Workflow

If you want the fastest path to something working, use this order:

1. create a backend app with `cd api && npm run startapp blog`
2. define your model in `api/src/apps/blog/models.ts`
3. add public routes in `api/src/apps/blog/routes.ts`
4. import the model file in `api/src/index.ts`
5. register the route module in `api/src/index.ts`
6. restart the API
7. log into the admin and manage the model there
8. fetch the same data from your public frontend

The generated app scaffold now includes:

- `models.ts`
- `service.ts`
- `routes.ts`
- `index.ts`

For the full walkthrough, read [First Feature Guide](./tutorials/FIRST_FEATURE_GUIDE.md).

## Quick Start

### Prerequisites

- Node.js `20.x` LTS
- npm
- Windows users should stay on Node 20 for this repo to avoid native module build issues

This repo now enforces Node `20.x` during install, whether you run npm from the root, `api`, or `admin`.

### Install

```bash
git clone https://github.com/samratpro/NextAdmin.git
cd NextAdmin

npm install
cd api && npm install
cd ../admin && npm install
```

### Run in Development

Option 1, run both services from the root:

```bash
npm run dev
```

Option 2, run them separately:

```bash
cd api
npm run dev
```

```bash
cd admin
npm run dev
```

### Verify Before Pushing

```bash
npm run verify
```

This builds both `api` and `admin` on the pinned Node version.

## Core Workflow

### Create a Superuser

```bash
cd api
npm run createsuperuser
```

### Create a New App

```bash
cd api
npm run startapp blog
```

This scaffolds a new backend app under `api/src/apps/blog`.

The scaffold now includes example `models.ts`, `service.ts`, and `routes.ts` files.

### Register a Model

Create your model in `api/src/apps/<appName>/models.ts`, decorate it with `@registerAdmin`, and import the file in `api/src/index.ts`.

Example:

```typescript
import { Model } from '../../core/model';
import { CharField, BooleanField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'Blog',
  displayName: 'Posts',
  listDisplay: ['id', 'title', 'isPublished']
})
export class Post extends Model {
  static getTableName(): string {
    return 'posts';
  }

  title = new CharField({ maxLength: 200 });
  isPublished = new BooleanField({ default: false });
}
```

Then register the model module:

```typescript
import './apps/blog/models';
```

If you want public API routes for that app, also register the route module:

```typescript
import blogRoutes from './apps/blog/routes';

await fastify.register(blogRoutes);
```

Imported models that use `@registerAdmin(...)` are now auto-created on startup and show up in the admin once the API restarts.

### Database Changes and Migrations

There is already a migration guide in [Database and Migrations](./tutorials/DATABASE_MIGRATIONS.md).

Important: this repo is not using Prisma right now. NextAdmin's backend uses its own lightweight ORM plus a sync-on-start table creation flow, so Prisma migration commands are not part of the current workflow.

For quick reference:

```bash
cd api
npm run migrate
npm run makemigrations
```

Those commands are guidance helpers, not migration generators. For real schema changes today:

- new models: import them and restart the API
- disposable local schema changes: reset `api/db.sqlite3`
- production or data-preserving changes: run explicit SQL

Full details live in [Database and Migrations](./tutorials/DATABASE_MIGRATIONS.md).

## Auth and Public Frontend Integration

The backend already ships with auth endpoints that both the admin and your public app can use:

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /auth/me`

Typical public app flow:

1. register through the API
2. verify the account from a link sent to your public frontend
3. log in and store the returned JWT tokens
4. call protected API routes with `Authorization: Bearer <token>`

Important config for that flow:

- `CORS_ORIGIN` should include both the admin origin and the public frontend origin
- `FRONTEND_URL` should point to your user-facing app because verification and reset emails use it
- `NEXT_PUBLIC_API_URL` should point each frontend to the API

Example local backend config:

```env
PORT=8000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:7000,http://localhost:3000
ADMIN_URL=http://localhost:7000
FRONTEND_URL=http://localhost:3000
```

Example frontend config:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Philosophy

NextAdmin is built around a few engineering principles:

- loose coupling over framework magic
- explicit boundaries between backend, admin, and public frontend
- app-level modularity for feature development
- simple defaults for solo builders and small teams
- enough convention to move quickly, without forcing every layer into one architecture

If you come from Django, the structure will feel familiar. If you come from Node.js, the boundaries should feel easier to control.

## Production Database Reality

NextAdmin is currently SQLite-first.

What is supported today:

- SQLite in development
- SQLite in production
- changing the SQLite file location with `DB_PATH`

What is not supported yet as a simple configuration switch:

- `DB_CLIENT=postgres`
- `DATABASE_URL=postgres://...`
- dropping PostgreSQL into production without framework changes

The current database layer and ORM are still tied to SQLite implementation details, so PostgreSQL is possible only as an engineering task, not as an env-var-only setup.

If you need the honest current status and migration options, read:

- [Production Deployment](./tutorials/PRODUCTION_DEPLOYMENT.md)
- [Database and Migrations](./tutorials/DATABASE_MIGRATIONS.md)

## Troubleshooting Native Modules

If you see an error like `Error: The module ... was compiled against a different Node.js version`, it means a native module (like `better-sqlite3`) was installed with one Node version but you are trying to run it with another.

### Fix
Run the rebuild command in the `api` directory using your current Node version:

```bash
cd api
npm rebuild better-sqlite3
```

If that doesn't work, perform a clean install:

```bash
cd api
rm -rf node_modules
npm install
```

## Documentation

The main guides live in [`tutorials/README.md`](./tutorials/README.md).

- [Architecture](./tutorials/ARCHITECTURE.md)
- [First Feature Guide](./tutorials/FIRST_FEATURE_GUIDE.md)
- [Model Registration Guide](./tutorials/MODEL_REGISTRATION_GUIDE.md)
- [User and Authentication Guide](./tutorials/USER_AND_AUTH_GUIDE.md)
- [Public App Integration](./tutorials/PUBLIC_APP_INTEGRATION.md)
- [Email Configuration](./tutorials/EMAIL_CONFIGURATION.md)
- [Database and Migrations](./tutorials/DATABASE_MIGRATIONS.md)
- [Port Configuration](./tutorials/PORT_CONFIGURATION.md)
- [Rate Limiting](./tutorials/RATE_LIMITING.md)
- [Production Deployment](./tutorials/PRODUCTION_DEPLOYMENT.md)
- [Django Comparison](./tutorials/DJANGO_COMPARISON.md)

## Default Service URLs

- Admin UI: `http://localhost:7000`
- Swagger docs: `http://localhost:8000/docs`
- API base URL for the admin app: `http://localhost:8000`

## Stability Notes

- Node is pinned to `20.x`
- installs are guarded with engine checks
- CI verifies both backend and admin builds
- the admin app defaults to `http://localhost:8000` unless `NEXT_PUBLIC_API_URL` is set

For the smoothest local experience on Windows, keep the repo outside OneDrive-synced folders when possible.
