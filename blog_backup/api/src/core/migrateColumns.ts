/**
 * Lightweight column-level migration.
 * Runs on every startup — safely adds any columns that exist in the model
 * but are missing from the actual SQLite table.
 * Uses PRAGMA table_info() to detect existing columns and ALTER TABLE … ADD COLUMN for missing ones.
 */
import DatabaseManager from './database';

interface ColumnMigration {
  table: string;
  column: string;
  definition: string; // e.g. "INTEGER DEFAULT 1", "TEXT", "INTEGER"
}

const MIGRATIONS: ColumnMigration[] = [
  // Plan — device restriction fields
  { table: 'sub_plans', column: 'maxConcurrentDevices', definition: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'sub_plans', column: 'allowMultiDevice',     definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'sub_plans', column: 'deviceLockMinutes',    definition: 'INTEGER' },
  { table: 'sub_plans', column: 'stripeProductId',     definition: 'TEXT' },
  { table: 'sub_plans', column: 'stripePriceId',       definition: 'TEXT' },

  // DeviceSession — device info + lock fields
  { table: 'sub_device_sessions', column: 'os',            definition: 'TEXT' },
  { table: 'sub_device_sessions', column: 'ipAddress',     definition: 'TEXT' },
  { table: 'sub_device_sessions', column: 'macAddress',    definition: 'TEXT' },
  { table: 'sub_device_sessions', column: 'lockedUntilAt', definition: 'TEXT' },
  { table: 'sub_device_sessions', column: 'loggedOutAt',   definition: 'TEXT' },

  // Subscription — credit merging, Stripe, and period tracking
  { table: 'sub_subscriptions', column: 'totalCreditsLimit',    definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'sub_subscriptions', column: 'totalCreditsUsed',     definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'sub_subscriptions', column: 'lastCreditUsedAt',     definition: 'TEXT' },
  { table: 'sub_subscriptions', column: 'creditsGrantedAt',     definition: 'TEXT' },
  { table: 'sub_subscriptions', column: 'stripeSubscriptionId', definition: 'TEXT' },
  { table: 'sub_subscriptions', column: 'stripeCustomerId',     definition: 'TEXT' },
  { table: 'sub_subscriptions', column: 'currentPeriodEnd',     definition: 'TEXT' },
  { table: 'sub_subscriptions', column: 'updatedAt',            definition: 'TEXT' },

  // SeoProject — CMS admin credentials + panel login + subscription link
  { table: 'seo_projects', column: 'websiteAdminUrl',      definition: 'TEXT' },
  { table: 'seo_projects', column: 'websiteAdminUsername', definition: 'TEXT' },
  { table: 'seo_projects', column: 'websiteAdminPassword', definition: 'TEXT' },
  { table: 'seo_projects', column: 'panelLoginUrl',        definition: 'TEXT' },
  { table: 'seo_projects', column: 'panelUsername',        definition: 'TEXT' },
  { table: 'seo_projects', column: 'panelPassword',        definition: 'TEXT' },
  { table: 'seo_projects', column: 'seoSubscriptionId',    definition: 'INTEGER' },
  { table: 'seo_projects', column: 'clientName',           definition: 'TEXT' },
  { table: 'seo_projects', column: 'clientEmail',          definition: 'TEXT' },
  { table: 'seo_projects', column: 'clientWhatsapp',       definition: 'TEXT' },
  { table: 'seo_projects', column: 'clientContact',        definition: 'TEXT' },
  { table: 'seo_projects', column: 'notes',                definition: 'TEXT' },
  { table: 'seo_projects', column: 'paymentStatus',        definition: "TEXT NOT NULL DEFAULT 'pending'" },
  { table: 'seo_projects', column: 'billingType',          definition: "TEXT NOT NULL DEFAULT 'onetime'" },
  { table: 'seo_projects', column: 'priceUsdCents',        definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'seo_projects', column: 'selectedPlanId',       definition: 'INTEGER' },
  { table: 'seo_projects', column: 'selectedPlanName',     definition: 'TEXT' },
  { table: 'seo_projects', column: 'paymentLinkToken',     definition: 'TEXT' },
  { table: 'seo_projects', column: 'paymentLinkUrl',       definition: 'TEXT' },
  { table: 'seo_projects', column: 'setupPasswordToken',   definition: 'TEXT' },
  { table: 'seo_projects', column: 'setupPasswordSentAt',  definition: 'TEXT' },
  { table: 'seo_projects', column: 'setupPasswordGeneratedAt', definition: 'TEXT' },
  { table: 'seo_projects', column: 'paidAt',               definition: 'TEXT' },
  { table: 'seo_projects', column: 'stripeCheckoutSessionId', definition: 'TEXT' },
  { table: 'seo_projects', column: 'stripeSubscriptionId', definition: 'TEXT' },
  { table: 'seo_projects', column: 'stripePaymentIntentId', definition: 'TEXT' },
  { table: 'seo_projects', column: 'stripeOrderId',         definition: 'TEXT' },
  
  // CustomProject — client-provided task URL
  { table: 'custom_projects', column: 'taskUrl', definition: 'TEXT' },

  // SeoPlan — Stripe integration
  { table: 'seo_plans', column: 'stripeProductId', definition: 'TEXT' },
  { table: 'seo_plans', column: 'stripePriceId',   definition: 'TEXT' },

  // CustomOffer — admin approval + tracking
  { table: 'custom_offers', column: 'adminPriceUsdCents',    definition: 'INTEGER' },
  { table: 'custom_offers', column: 'adminDeliveryDate',     definition: 'TEXT' },
  { table: 'custom_offers', column: 'adminNotes',            definition: 'TEXT' },
  { table: 'custom_offers', column: 'paymentStatus',         definition: "TEXT NOT NULL DEFAULT 'pending'" },
  { table: 'custom_offers', column: 'paymentLinkUrl',        definition: 'TEXT' },
  { table: 'custom_offers', column: 'stripeSubscriptionId',  definition: 'TEXT' },
  { table: 'custom_offers', column: 'paidAt',                definition: 'TEXT' },
];

async function repairSubSubscriptionsSchema(): Promise<void> {
  const db = DatabaseManager.getAdapter();
  try {
    const columns = await db.all<any>('PRAGMA table_info(sub_subscriptions)');
    const hasTotalCreditsLimit = columns.some((c: any) => c.name === 'totalCreditsLimit');
    const hasStripeSubId = columns.some((c: any) => c.name === 'stripeSubscriptionId');

    // ONLY repair if critical columns are missing
    if (hasTotalCreditsLimit && hasStripeSubId) return;

    console.log('[migrate] Rebuilding sub_subscriptions with full schema...');
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec('BEGIN TRANSACTION');
    
    await db.exec(`
      CREATE TABLE sub_subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        appId INTEGER NOT NULL,
        planId INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        creditsRemaining INTEGER NOT NULL DEFAULT 0,
        totalCreditsLimit INTEGER NOT NULL DEFAULT 0,
        totalCreditsUsed INTEGER NOT NULL DEFAULT 0,
        lastCreditUsedAt DATETIME,
        creditsGrantedAt DATETIME,
        stripeSubscriptionId VARCHAR(255),
        stripeCustomerId VARCHAR(255),
        currentPeriodEnd DATETIME,
        updatedAt DATETIME,
        createdAt DATETIME NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (appId) REFERENCES sub_apps(id) ON DELETE CASCADE,
        FOREIGN KEY (planId) REFERENCES sub_plans(id) ON DELETE CASCADE
      )
    `);

    // Copy data (safely handling missing columns in old table)
    await db.exec(`
      INSERT INTO sub_subscriptions_new (
        id, userId, appId, planId, status, creditsRemaining, createdAt
      )
      SELECT id, userId, appId, planId, status, creditsRemaining, createdAt FROM sub_subscriptions
    `);

    await db.exec('DROP TABLE sub_subscriptions');
    await db.exec('ALTER TABLE sub_subscriptions_new RENAME TO sub_subscriptions');
    await db.exec('COMMIT');
    console.log('[migrate] sub_subscriptions rebuilt successfully');
  } catch (err: any) {
    if (err.message?.includes('no such table')) return;
    await db.exec('ROLLBACK');
    console.error(`[migrate] Schema repair failed: ${err.message}`);
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
}

async function repairSeoSubscriptionForeignKey(): Promise<void> {
  const db = DatabaseManager.getAdapter();

  try {
    const foreignKeys = await db.all<any>('PRAGMA foreign_key_list(seo_subscriptions)');
    const brokenPlanForeignKey = foreignKeys.some((fk: any) =>
      fk.from === 'planId' && fk.table === 'seoplans'
    );

    if (!brokenPlanForeignKey) {
      return;
    }

    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec('BEGIN TRANSACTION');
    await db.exec(`
      CREATE TABLE seo_subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        planId INTEGER NOT NULL,
        seoProjectId INTEGER,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        stripeSubscriptionId VARCHAR(255),
        stripePaymentIntentId VARCHAR(255),
        currentPeriodEnd DATETIME,
        createdAt DATETIME NOT NULL,
        FOREIGN KEY (planId) REFERENCES seo_plans(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await db.exec(`
      INSERT INTO seo_subscriptions_new (
        id, userId, planId, seoProjectId, status,
        stripeSubscriptionId, stripePaymentIntentId, currentPeriodEnd, createdAt
      )
      SELECT
        id, userId, planId, seoProjectId, status,
        stripeSubscriptionId, stripePaymentIntentId, currentPeriodEnd, createdAt
      FROM seo_subscriptions
    `);
    await db.exec('DROP TABLE seo_subscriptions');
    await db.exec('ALTER TABLE seo_subscriptions_new RENAME TO seo_subscriptions');
    await db.exec('COMMIT');
    console.log('[migrate] Rebuilt seo_subscriptions foreign key to reference seo_plans');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
}

export async function migrateColumns(): Promise<void> {
  const db = DatabaseManager.getAdapter();

  for (const { table, column, definition } of MIGRATIONS) {
    try {
      // Check existing columns via PRAGMA
      const rows = await db.all(`PRAGMA table_info(${table})`);
      const exists = rows.some((r: any) => r.name === column);
      if (!exists) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[migrate] Added column ${table}.${column}`);
      }
    } catch (err: any) {
      // Table doesn't exist yet — createTable() will handle it
      if (!err.message?.includes('no such table')) {
        console.warn(`[migrate] ${table}.${column}: ${err.message}`);
      }
    }
  }

  await repairSubSubscriptionsSchema();
  await repairSeoSubscriptionForeignKey();
}
