const db = require('better-sqlite3')('./db.sqlite3');
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@admin.com');
console.log('User found:', JSON.stringify(user, null, 2));

if (user) {
    if (user.isActive === 0) {
        console.log('Activating user...');
        db.prepare('UPDATE users SET isActive = 1 WHERE id = ?').run(user.id);
    }
}
