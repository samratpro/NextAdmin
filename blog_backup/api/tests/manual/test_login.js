const bcrypt = require('bcryptjs');
const db = require('better-sqlite3')('./db.sqlite3');

async function testLogin() {
    const email = 'admin@admin.com';
    const password = 'admin';
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    console.log('User found in literal DB:', !!user);
    if (!user) return;
    
    const valid = await bcrypt.compare(password, user.password);
    console.log('Password valid (bcrypt test):', valid);
    console.log('User isActive:', user.isActive);
}

testLogin();
