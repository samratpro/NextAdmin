const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../api/db.sqlite3');
const db = new Database(dbPath);

console.log('--- Auth Users ---');
const users = db.prepare('SELECT id, email, is_staff, is_superuser FROM auth_users LIMIT 5').all();
console.table(users);

console.log('\n--- Custom Offers ---');
const offers = db.prepare('SELECT id, userId, clientName, type, status FROM custom_offers LIMIT 5').all();
console.table(offers);

db.close();
