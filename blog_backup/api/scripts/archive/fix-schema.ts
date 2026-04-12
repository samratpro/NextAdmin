import DatabaseManager from './src/core/database';
import { SQLiteAdapter } from './src/core/db/sqliteAdapter';

async function fixSchema() {
    console.log('Starting schema fix...');
    const adapter = new SQLiteAdapter('./db.sqlite3');
    
    try {
        await adapter.exec('PRAGMA foreign_keys = OFF');
        await adapter.exec('BEGIN TRANSACTION');
        
        // 1. Create new table
        await adapter.exec(`
            CREATE TABLE custom_offers_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type VARCHAR(50) NOT NULL,
                clientName VARCHAR(255) NOT NULL,
                clientEmail VARCHAR(255) NOT NULL,
                clientWhatsapp VARCHAR(255),
                clientContact VARCHAR(255),
                websiteUrl VARCHAR(255),
                projectName VARCHAR(255),
                projectInfo TEXT NOT NULL,
                proposedPriceUsdCents INTEGER NOT NULL,
                proposedDeliveryDate DATETIME,
                isMonthly BOOLEAN NOT NULL DEFAULT 0,
                adminPriceUsdCents INTEGER,
                adminDeliveryDate DATETIME,
                adminNotes TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                paymentLinkToken VARCHAR(255),
                userId INTEGER,
                createdAt DATETIME NOT NULL,
                updatedAt DATETIME NOT NULL
            )
        `);
        
        // 2. Copy data
        await adapter.exec(`
            INSERT INTO custom_offers_new (
                id, type, clientName, clientEmail, clientWhatsapp, clientContact,
                websiteUrl, projectName, projectInfo, proposedPriceUsdCents,
                proposedDeliveryDate, isMonthly, adminPriceUsdCents, adminDeliveryDate,
                adminNotes, status, paymentLinkToken, userId, createdAt, updatedAt
            )
            SELECT 
                id, type, clientName, clientEmail, clientWhatsapp, clientContact,
                websiteUrl, projectName, projectInfo, proposedPriceUsdCents,
                proposedDeliveryDate, isMonthly, adminPriceUsdCents, adminDeliveryDate,
                adminNotes, status, paymentLinkToken, userId, createdAt, updatedAt
            FROM custom_offers
        `);
        
        // 3. Swap tables
        await adapter.exec('DROP TABLE custom_offers');
        await adapter.exec('ALTER TABLE custom_offers_new RENAME TO custom_offers');
        
        await adapter.exec('COMMIT');
        console.log('Schema fix completed successfully!');
    } catch (err) {
        await adapter.exec('ROLLBACK');
        console.error('Schema fix failed:', err);
    } finally {
        await adapter.exec('PRAGMA foreign_keys = ON');
        await adapter.close();
    }
}

fixSchema();
