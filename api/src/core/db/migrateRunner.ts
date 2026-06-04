import fs from 'fs';
import path from 'path';
import DatabaseManager from './../database';
import { Migration, MigrationRecord } from './Migration';

export async function runMigrations() {
  console.log('[INFO] Checking for pending database migrations...');
  
  const db = DatabaseManager.getAdapter();
  
  // Ensure migrations table exists
  await Migration.createTable();
  
  const migrationsDir = path.join(__dirname, '../../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[INFO] No migrations directory found. Skipping migrations.');
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .sort(); // Sorting ensures chronological order based on timestamp prefix
  
  if (files.length === 0) {
    console.log('[INFO] No migration files found.');
    return;
  }

  // Get applied migrations
  const appliedMigrationsResult = await Migration.objects.all<MigrationRecord>().all();
  const appliedNames = new Set(appliedMigrationsResult.map(m => m.name));

  const pendingMigrations = files.filter(f => !appliedNames.has(f));

  if (pendingMigrations.length === 0) {
    console.log('[INFO] No pending migrations to apply.');
    return;
  }

  for (const file of pendingMigrations) {
    console.log(`[INFO] Applying migration: ${file}...`);
    const migrationPath = path.join(migrationsDir, file);
    try {
      const importPath = process.platform === 'win32' ? 'file://' + migrationPath.replace(/\\/g, '/') : migrationPath;
      const migrationModule = await import(importPath);
      if (migrationModule.up) {
        await migrationModule.up(db);
        // Record as applied
        await Migration.objects.create({ name: file } as any);
        console.log(`[SUCCESS] Migration ${file} applied successfully.`);
      } else {
        console.warn(`[WARN] Migration ${file} does not export an 'up' function.`);
      }
    } catch (err) {
      console.error(`[ERROR] Failed to apply migration ${file}:`, err);
      // Stop further migrations on failure, throw error to stop server start
      throw err;
    }
  }

  console.log('[INFO] All pending migrations applied successfully.');
}
