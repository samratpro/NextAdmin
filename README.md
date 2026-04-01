# Nango

Nango is a Django-inspired full-stack framework for Node.js that keeps the productive parts of Django while using a more decoupled architecture.

Instead of tightly coupling templates, admin, routing, and backend logic into one runtime, Nango separates concerns clearly:

- `api/` contains the backend, ORM, auth, and CLI tools.
- `admin/` is a dedicated Next.js admin application.
- your public frontend can live separately and talk to the API on its own terms.

The goal is not to clone Django line-for-line. The goal is to offer a familiar app-oriented workflow with looser coupling, clearer boundaries, and practical engineering defaults.

## Why Nango

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
- Admin: `http://localhost:8001`
- Public app: `http://localhost:3000` if you build one alongside this repo

## Quick Start

### Prerequisites

- Node.js `20.x` LTS
- npm
- Windows users should stay on Node 20 for this repo to avoid native module build issues

This repo now enforces Node `20.x` during install, whether you run npm from the root, `api`, or `admin`.

### Install

```bash
git clone https://github.com/samratpro/nango.git
cd nango

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

## Philosophy

Nango is built around a few engineering principles:

- loose coupling over framework magic
- explicit boundaries between backend, admin, and public frontend
- app-level modularity for feature development
- simple defaults for solo builders and small teams
- enough convention to move quickly, without forcing every layer into one architecture

If you come from Django, the structure will feel familiar. If you come from Node.js, the boundaries should feel easier to control.

## Documentation

The main guides live in [`tutorials/README.md`](./tutorials/README.md).

- [Architecture](./tutorials/ARCHITECTURE.md)
- [Model Registration Guide](./tutorials/MODEL_REGISTRATION_GUIDE.md)
- [User and Authentication Guide](./tutorials/USER_AND_AUTH_GUIDE.md)
- [Database and Migrations](./tutorials/DATABASE_MIGRATIONS.md)
- [Port Configuration](./tutorials/PORT_CONFIGURATION.md)
- [Rate Limiting](./tutorials/RATE_LIMITING.md)
- [Production Deployment](./tutorials/PRODUCTION_DEPLOYMENT.md)
- [Django Comparison](./tutorials/DJANGO_COMPARISON.md)

## Default Service URLs

- Admin UI: `http://localhost:8001`
- Swagger docs: `http://localhost:8000/docs`
- API base URL for the admin app: `http://localhost:8000`

## Stability Notes

- Node is pinned to `20.x`
- installs are guarded with engine checks
- CI verifies both backend and admin builds
- the admin app defaults to `http://localhost:8000` unless `NEXT_PUBLIC_API_URL` is set

For the smoothest local experience on Windows, keep the repo outside OneDrive-synced folders when possible.
