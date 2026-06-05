const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../db.sqlite3');
const db = new Database(dbPath);

try {
    console.log('Adding metaTitle column to blog_posts...');
    db.exec('ALTER TABLE blog_posts ADD COLUMN metaTitle VARCHAR(60)');
    console.log('metaTitle added successfully.');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('metaTitle column already exists.');
    } else {
        console.error('Error adding metaTitle:', err.message);
    }
}

try {
    console.log('Adding metaDescription column to blog_posts...');
    db.exec('ALTER TABLE blog_posts ADD COLUMN metaDescription VARCHAR(160)');
    console.log('metaDescription added successfully.');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('metaDescription column already exists.');
    } else {
        console.error('Error adding metaDescription:', err.message);
    }
}

db.close();
console.log('Migration finished.');
