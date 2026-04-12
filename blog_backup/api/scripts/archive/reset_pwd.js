const db = require('better-sqlite3')('./db.sqlite3');
const bcrypt = require('bcryptjs');

async function reset() {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin', salt);
    db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, 'admin@admin.com');
    console.log('Password reset to "admin" for admin@admin.com');
}

reset();
