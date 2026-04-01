# Production Deployment

This guide explains the practical deployment story for Nango today.

The short version:

- SQLite is the default and works well for many small and medium deployments
- PostgreSQL is possible, but not yet a drop-in runtime switch
- the current ORM is still shaped around SQLite assumptions

## Default Recommendation: SQLite

Nango is optimized around SQLite and `better-sqlite3`.

That is a reasonable production choice when you want:

- low infrastructure overhead
- simple backups
- a single-server deployment
- modest write volume
- fast local-to-production parity

SQLite is often underestimated. For many internal tools, admin-heavy systems, and moderate traffic apps, it is entirely practical.

## A Good SQLite Deployment Shape

Typical setup:

1. deploy the API to a VPS or persistent VM
2. keep the database on durable local disk
3. run the process with a supervisor such as `pm2`
4. proxy traffic through Nginx or Caddy
5. back up the SQLite file regularly

Example:

```bash
cd api
npm run build
pm2 start dist/index.js --name nango-api
```

## Backups

At minimum, back up:

- `api/db.sqlite3`

For stronger durability, use scheduled snapshots or tools such as Litestream-style replication workflows.

## When SQLite Stops Being a Good Fit

Consider moving off SQLite if you need:

- high write concurrency
- horizontal scaling across multiple API instances
- managed database tooling and observability
- more advanced SQL and indexing patterns

## PostgreSQL Today

PostgreSQL is possible, but it is not yet a fully abstracted backend option in this repo.

The current ORM and database layer are still coupled to SQLite details such as:

- `better-sqlite3`
- SQLite-style placeholders
- SQLite insert semantics
- manual boolean conversion logic in the model layer

That means a true PostgreSQL migration is an engineering task, not an environment-variable switch.

## What You Can Configure Today

Today, the only built-in database runtime configuration is the SQLite file path:

```env
DB_PATH=./db.sqlite3
```

That setting is read by the SQLite database manager in `api/src/core/database.ts`.

There is currently no supported production configuration like:

```env
DATABASE_URL=postgres://...
DB_CLIENT=postgres
```

Those variables would not switch the runtime to PostgreSQL in the current codebase.

## If a User Wants PostgreSQL in Production

The honest answer is:

- there is no documented PostgreSQL production config because PostgreSQL is not yet a first-class runtime backend here
- a user cannot enable PostgreSQL only by changing environment variables
- the framework code must be adapted first

The main SQLite-specific areas today are:

- `api/src/core/database.ts`
- `api/src/core/model.ts`
- schema creation behavior in the model layer
- manual migration guidance that currently assumes SQLite-first workflows

If you want to support PostgreSQL properly, the framework should first gain:

1. a PostgreSQL connection layer
2. a database selection mechanism such as `DB_CLIENT=sqlite|postgres`
3. a PostgreSQL connection config such as `DATABASE_URL=postgres://...`
4. SQL generation that works across both engines
5. insert/update behavior that does not rely on SQLite-only semantics
6. a clearer migration story for non-SQLite deployments

Only after that work would a production PostgreSQL configuration section make sense.

## Example of a Future PostgreSQL Config

The following is an example of what a future PostgreSQL setup could look like after framework support is added:

```env
DB_CLIENT=postgres
DATABASE_URL=postgres://app_user:app_password@db.example.com:5432/nango
```

That example is illustrative only. It is not supported by the current implementation.

## Two Practical Paths to PostgreSQL

### Path 1: Adapt the Existing ORM

This keeps the current programming model but requires framework work.

You would need to:

1. replace the SQLite connection layer
2. update SQL placeholder generation
3. update insert handling to return ids properly
4. remove SQLite-specific assumptions from the model layer

This is the path to take if you want to preserve the current framework shape.

### Path 2: Replace the Data Layer

For heavier scaling, it may be more pragmatic to replace the custom ORM with a more mature tool such as Prisma or TypeORM.

This is the path to take if:

- Postgres is a hard requirement
- you want richer query capabilities
- you want a broader ecosystem around migrations and schema management

## Production Environment Variables

At minimum, harden these values:

```env
NODE_ENV=production
CORS_ORIGIN=https://admin.example.com,https://example.com
JWT_SECRET=replace-with-a-strong-random-value
SECRET_KEY=replace-with-a-strong-random-value
```

Also set the admin's API URL correctly in production:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

## Deploying the Admin App

The admin app is a standard Next.js project.

You can deploy it to:

- Vercel
- Netlify
- your own VPS

The key requirement is that it can reach the API and uses the correct `NEXT_PUBLIC_API_URL`.

## Honest Current State

Nango is production-capable today for teams that are comfortable with:

- a SQLite-first backend
- a custom ORM with explicit boundaries
- a separate admin app

If you want Django-scale ORM maturity or first-class multi-database support, that is still future work rather than current reality.
