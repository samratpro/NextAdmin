const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../db.sqlite3');
const db = new Database(dbPath);

console.log('Fixing custom_offers paymentStatus...');
const result = db.prepare("UPDATE custom_offers SET paymentStatus = 'pending' WHERE paymentStatus IS NULL OR paymentStatus = ''").run();
console.log(`Updated ${result.changes} records.`);

db.close();
