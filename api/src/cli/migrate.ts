import { runMigrations } from '../core/db/migrateRunner';
import DatabaseManager from '../core/database';
import settings from '../config/settings';

async function run() {
  console.log('[INFO] Starting migration process...');
  
  // Initialize DB
  const db = DatabaseManager.initialize(settings.database);
  await runMigrations();
  await DatabaseManager.close();
  console.log('[INFO] Migration process completed.');
}

run().catch(console.error);
