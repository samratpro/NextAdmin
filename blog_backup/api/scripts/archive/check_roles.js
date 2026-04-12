const db = require('better-sqlite3')('./db.sqlite3');
const users = db.prepare('SELECT id, username, isStaff, isSuperuser FROM users WHERE isStaff = 1 OR isSuperuser = 1').all();
console.log('Admins/Staff in DB:', JSON.stringify(users, null, 2));

const clients = db.prepare('SELECT id, username, isStaff, isSuperuser FROM users WHERE username IN (?, ?)').all('sam', 'samrat');
console.log('Sam/Samrat status:', JSON.stringify(clients, null, 2));
