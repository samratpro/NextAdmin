const db = require('better-sqlite3')('./db.sqlite3');
const bcrypt = require('bcryptjs');

async function fix() {
    db.prepare('DELETE FROM users WHERE email = ?').run('admin@admin.com');
    
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin', salt);
    
    db.prepare(`
        INSERT INTO users (username, email, password, isActive, isStaff, isSuperuser, dateJoined)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin@admin.com', hash, 1, 1, 1, new Date().toISOString());
    
    console.log('Admin user re-created with password "admin"');
}

fix();
