import { config } from 'dotenv';
config();
import DatabaseManager from '../core/database';
import settings from '../config/settings';
import { User } from '../apps/auth/models';

async function main() {
    DatabaseManager.initialize(settings.database);
    await User.createTable();

    const db = DatabaseManager.getAdapter();
    const rows = await db.all('SELECT * FROM users');
    console.log('Raw users in DB:', rows);

    let admin: any = await User.objects.get<User>({ username: 'admin' });
    console.log('Query for admin object:', admin);

    if (!admin) {
        console.log('Admin not found. Creating one...');
        admin = new User();
        admin.username = 'admin';
        admin.email = 'admin@admin.com';
        admin.isStaff = true;
        admin.isSuperuser = true;
        admin.isActive = true;
        await admin.setPassword('admin');
        await admin.save();
        console.log('Created admin!');
    } else {
        console.log('Admin found! Updating details...');
        admin.email = 'admin@admin.com';
        admin.isActive = true;
        admin.isStaff = true;
        admin.isSuperuser = true;
        await admin.setPassword('admin');
        await admin.save();
        console.log('Updated admin!');
    }

    const rowsAfter = await db.all('SELECT * FROM users');
    console.log('Raw users in DB after:', rowsAfter);
}

main().catch(err => console.error(err));
