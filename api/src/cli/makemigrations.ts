import fs from 'fs';
import path from 'path';
import { ModelRegistry } from '../core/ModelRegistry';
import { Model } from '../core/model';

// We need to import index to trigger model loading, but we don't want to start the server.
// So we'll replicate the model loading logic from index.ts here.
import {
  User, Group, Permission, UserPermission, GroupPermission, UserGroup,
  EmailVerificationToken, PasswordResetToken, RefreshToken
} from '../apps/auth/models';
import { Migration } from '../core/db/Migration';

async function loadAppModels() {
  const appsDir = path.join(__dirname, '../apps');
  if (!fs.existsSync(appsDir)) return;
  const appNames = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

  for (const app of appNames) {
    const appPath = path.join(appsDir, app);
    const files = fs.readdirSync(appPath);
    const hasModelsFile = files.some(f => f === 'models.ts' || f === 'models.js');
    const hasModelsDir = files.includes('models') && fs.statSync(path.join(appPath, 'models')).isDirectory();
    
    if (hasModelsFile || hasModelsDir) {
      try {
        await import(`../apps/${app}/models`);
      } catch (e: any) {
        console.error(`Error loading models for app ${app}:`, e);
      }
    }
  }
}

export async function runMakeMigrations() {
  console.log('[INFO] Starting makemigrations...');
  await loadAppModels();

  const coreModels = [
    User, Group, Permission, UserPermission, GroupPermission, UserGroup,
    EmailVerificationToken, PasswordResetToken, RefreshToken, Migration
  ];

  const allModels: typeof Model[] = [...coreModels];
  for (const metadata of ModelRegistry.getAllModels()) {
    if (!allModels.includes(metadata.model)) {
      allModels.push(metadata.model);
    }
  }

  const migrationsDir = path.join(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const stateFile = path.join(migrationsDir, 'state.json');
  let previousState: Record<string, Record<string, string>> = {};
  if (fs.existsSync(stateFile)) {
    previousState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }

  const currentState: Record<string, Record<string, string>> = {};
  const upQueries: string[] = [];
  const downQueries: string[] = [];

  for (const model of allModels) {
    const tableName = model.getTableName();
    const fields = model.getFields();
    currentState[tableName] = {};

    const isNewTable = !previousState[tableName];
    
    if (isNewTable) {
      // Generate CREATE TABLE
      const fieldDefinitions: string[] = [];
      const foreignKeys: string[] = [];

      for (const [, field] of Object.entries(fields)) {
        const definition = field.getFullDefinition();
        currentState[tableName][field.fieldName] = definition;

        if (definition.includes('FOREIGN KEY')) {
          const parts = definition.split(', FOREIGN KEY');
          fieldDefinitions.push(parts[0]);
          foreignKeys.push('FOREIGN KEY' + parts[1]);
        } else {
          fieldDefinitions.push(definition);
        }
      }

      const allDefinitions = [...fieldDefinitions, ...foreignKeys].join(', ');
      upQueries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (${allDefinitions});`);
      downQueries.push(`DROP TABLE IF EXISTS ${tableName};`);
    } else {
      // Table exists, check for new columns
      for (const [, field] of Object.entries(fields)) {
        const definition = field.getFullDefinition();
        currentState[tableName][field.fieldName] = definition;

        if (!previousState[tableName][field.fieldName]) {
          // New column
          // Note: SQLite ALTER TABLE ADD COLUMN does not support FOREIGN KEY directly in the same way,
          // but for basic usage we will output standard ALTER TABLE.
          upQueries.push(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`);
          // Down query for dropping column is complex across dialects, so we add a comment or raw SQL
          downQueries.push(`ALTER TABLE ${tableName} DROP COLUMN ${field.fieldName}; -- Note: SQLite < 3.35 doesn't support DROP COLUMN`);
        } else if (previousState[tableName][field.fieldName] !== definition) {
          console.log(`[WARN] Column ${tableName}.${field.fieldName} definition changed. Automatic ALTER COLUMN is not supported. Please edit the migration manually if needed.`);
        }
      }
    }
  }

  if (upQueries.length === 0) {
    console.log('[INFO] No changes detected.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const migrationName = `${timestamp}_auto.ts`;
  const migrationFile = path.join(migrationsDir, migrationName);

  const migrationContent = `// Auto-generated migration: ${new Date().toISOString()}
import { DbAdapter } from '../core/db/types';

export const up = async (db: DbAdapter) => {
${upQueries.map(q => `  await db.exec(\`${q}\`);`).join('\n')}
};

export const down = async (db: DbAdapter) => {
${downQueries.map(q => `  await db.exec(\`${q}\`);`).join('\n')}
};
`;

  fs.writeFileSync(migrationFile, migrationContent, 'utf8');
  fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2), 'utf8');
  console.log(`[SUCCESS] Created migration: src/migrations/${migrationName}`);
}

// Only execute directly if this file is run as the main script
if (require.main === module) {
  runMakeMigrations().catch(console.error);
}
