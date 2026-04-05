# Database and Migrations

Nango does not use Prisma in this repo.

Nango currently uses a lightweight sync-on-start model instead of a full migration framework.

That means Prisma commands such as `npx prisma migrate dev` or `npx prisma db push` do not apply to this codebase as-is.

That makes early development fast, but it also means you need to be explicit when changing an existing schema.

## How Schema Creation Works

When the API starts:

1. it imports registered model modules
2. it reads the model definitions
3. it runs `CREATE TABLE IF NOT EXISTS` for those models

This means new tables can be created automatically when you add a brand-new model and restart the server.

## What It Does Not Do

It does not currently:

- diff existing schemas
- add columns automatically to existing tables
- rename columns safely
- maintain a historical migration ledger like Django

That is the main tradeoff of the current simple model.

## Development Workflow

If you change a schema during early local development and you do not care about preserving data, the fastest path is usually:

1. stop the API
2. delete `api/db.sqlite3`
3. restart the API
4. recreate any necessary users or seed data

The helper commands in `api/package.json` are informational:

```bash
cd api
npm run migrate
npm run makemigrations
```

They explain the current sync-on-start workflow, but they do not generate Prisma migrations or Django-style migration files.

## Manual Schema Changes

If you need to preserve data, change the schema manually with SQL.

Example: adding an `age` column to `users`

1. update the model code

```typescript
age = new IntegerField({ default: 0 });
```

2. run SQL against the database

```sql
ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0;
```

3. restart the API

## Database Path

The default database path is configured in `api/.env`:

```env
DB_PATH=./db.sqlite3
```

You can point this to another path if needed.

## PostgreSQL Note

This database configuration is SQLite-only today.

`DB_PATH` changes the location of the SQLite file. It does not switch the backend to PostgreSQL.

There is currently no built-in config such as:

```env
DB_CLIENT=postgres
DATABASE_URL=postgres://...
```

If you want PostgreSQL, you need framework-level changes in the database and model layers before production configuration can be documented as a supported path.

## Recreating the Superuser

If you reset the database, recreate your admin account:

```bash
cd api
npm run createsuperuser
```

## Recommended Current Practice

For now, use this rule of thumb:

- new models: restart and let tables be created
- disposable local schema changes: reset the local database
- persistent or production schema changes: write explicit SQL

## Summary Table

| Task | Recommended Approach |
| --- | --- |
| add a new model | define model, import it, restart API |
| add a field locally | reset database if data is disposable |
| add a field in production | run manual SQL |
| rename a field | manual SQL migration |
| preserve existing data | do not rely on sync-on-start alone |
