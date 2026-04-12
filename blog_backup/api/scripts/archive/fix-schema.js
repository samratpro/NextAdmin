const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db.sqlite3');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Starting schema fix (plain JS)...');
    
    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN TRANSACTION');
    
    // 1. Create new table
    db.run(`
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
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err);
            db.run('ROLLBACK');
            return;
        }
    });
    
    // 2. Copy data
    db.run(`
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
    `, (err) => {
        if (err) {
            console.error('Error copying data:', err);
            db.run('ROLLBACK');
            return;
        }
    });
    
    // 3. Swap tables
    db.run('DROP TABLE custom_offers');
    db.run('ALTER TABLE custom_offers_new RENAME TO custom_offers', (err) => {
        if (err) {
            console.error('Error swapping tables:', err);
            db.run('ROLLBACK');
            return;
        }
        db.run('COMMIT', (err) => {
            if (err) console.error('Error committing:', err);
            else console.log('Schema fix completed successfully!');
            db.close();
        });
    });
});
