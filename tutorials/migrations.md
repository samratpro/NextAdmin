# Database Migrations Tutorial

NextAdmin provides a Django-style CLI tool for database migrations. This ensures that your database schema stays in sync with your models in a controlled, versionable way.

## Overview

The migration system has two primary commands:
1. `makemigrations`: Examines your models, compares them to the last migration state, and generates a new migration script.
2. `migrate`: Looks at all generated migration scripts and applies any that have not yet been run against your database.

You can run these commands from the root of your NextAdmin project using the `manage.js` wrapper script.

---

## 1. Creating Migrations

When you create a new model or add a new column to an existing model, you need to generate a migration.

```bash
node manage.js makemigrations
```

### What happens?
- The system scans `api/src/apps/*/models.ts` and `api/src/core/models.ts` for any defined models.
- It compares the current model fields with the previous state (stored in `api/src/migrations/state.json`).
- If it detects new tables or new columns, it generates a new timestamped file in `api/src/migrations/`, for example: `20260604220712_auto.ts`.

### Manual Adjustments
The automatic generator handles `CREATE TABLE` and simple `ALTER TABLE ADD COLUMN` operations. However, if you are doing complex operations such as:
- Renaming a column
- Changing a column's data type
- Dropping a column (SQLite has limited support for this)

You will see a `[WARN]` message in your console. The `makemigrations` script will still generate a template, but you should open the generated `.ts` file in `api/src/migrations/` and modify the SQL manually to suit your needs before running `migrate`.

---

## 2. Applying Migrations

Once your migration files are ready (and you have manually edited them if necessary), apply them to the database by running:

```bash
node manage.js migrate
```

### What happens?
- The system ensures the `nextadmin_migrations` table exists in your database.
- It reads all `.ts` files in the `api/src/migrations/` folder.
- It compares them against the entries in the `nextadmin_migrations` table.
- For every migration file that hasn't been applied, it executes the `up()` function containing the SQL commands.
- It records the migration as successfully applied so it doesn't run again.

---

## Example Workflow

### 1. Define a new model
In `api/src/apps/shop/models.ts`:

```typescript
import { Model, CharField, IntegerField } from '../../core/fields';

export class Product extends Model {
  name = new CharField({ maxLength: 255 });
  price = new IntegerField();
}
```

### 2. Generate the migration
```bash
node manage.js makemigrations
```
Output:
```
[INFO] Starting makemigrations...
[SUCCESS] Created migration: src/migrations/20260604220000_auto.ts
```

### 3. Apply the migration
```bash
node manage.js migrate
```
Output:
```
[INFO] Starting migration process...
[INFO] Applying migration: 20260604220000_auto.ts...
[SUCCESS] Migration 20260604220000_auto.ts applied successfully.
[INFO] Migration process completed.
```

## Summary
Never manually create tables in your database again. Just define your `Model`, run `makemigrations`, review the generated SQL if needed, and run `migrate`!
