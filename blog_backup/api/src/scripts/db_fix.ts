import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../db.sqlite3');
console.log('Using database:', dbPath);

const db = new Database(dbPath);

try {
    const columns = db.pragma('table_info(custom_projects)') as any[];
    console.log('Columns in custom_projects:', columns.map(c => c.name).join(', '));
    
    const hasGoogleDriveUrl = columns.some(c => c.name === 'googleDriveUrl');
    const hasTrelloUrl = columns.some(c => c.name === 'trelloUrl');
    const hasSheetUrl = columns.some(c => c.name === 'sheetUrl');
    
    if (!hasGoogleDriveUrl) {
        console.log('Adding googleDriveUrl...');
        db.exec("ALTER TABLE custom_projects ADD COLUMN googleDriveUrl TEXT;");
    }
    if (!hasTrelloUrl) {
        console.log('Adding trelloUrl...');
        db.exec("ALTER TABLE custom_projects ADD COLUMN trelloUrl TEXT;");
    }
    if (!hasSheetUrl) {
        console.log('Adding sheetUrl...');
        db.exec("ALTER TABLE custom_projects ADD COLUMN sheetUrl TEXT;");
    }

    // Update users table
    const userColumns = db.pragma('table_info(users)') as any[];
    const hasNeedsPasswordReset = userColumns.some(c => c.name === 'needsPasswordReset');
    if (!hasNeedsPasswordReset) {
        console.log('Adding needsPasswordReset column to users...');
        db.exec("ALTER TABLE users ADD COLUMN needsPasswordReset INTEGER DEFAULT 0;");
    }
    
    console.log('✅ Synchronized successfully.');
} catch (err: any) {
    console.error('❌ Error updating schema:', err.message);
} finally {
    db.close();
}
