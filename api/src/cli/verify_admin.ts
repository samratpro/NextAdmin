import { config } from 'dotenv';
config();

// Must be set BEFORE any module that uses the logger is imported.
process.env.LOG_LEVEL = 'silent';

async function run() {
    // Import and silence logger FIRST before any other app modules
    const { default: logger } = await import('../core/logger');
    logger.level = 'silent';

    // Now import models and other dependencies
    const [{ User }, { default: DatabaseManager }, { default: settings }] = await Promise.all([
        import('../apps/auth/models'),
        import('../core/database'),
        import('../config/settings'),
    ]);

    DatabaseManager.initialize(settings.database);
    await User.createTable();

    console.log('\n--- Checking Database Users ---');

    // Retrieve all users
    const allUsers = await User.objects.all<any>().all();
    console.log(`Total users in database: ${allUsers.length}`);

    if (allUsers.length > 0) {
        console.log('\nExisting users:');
        for (const u of allUsers) {
            console.log(`- Username: "${u.username}", Email: "${u.email}", isSuperuser: ${u.isSuperuser}, isStaff: ${u.isStaff}, isActive: ${u.isActive}`);
        }
    } else {
        console.log('\nNo users found in the database.');
    }

    // Check if the default superuser exists
    let adminUser = await User.objects.get<any>({ username: 'admin' });

    if (!adminUser) {
        console.log('\nCreating default superuser "admin" (admin@example.com / admin)...');
        adminUser = new User();
        (adminUser as any).username = 'admin';
        (adminUser as any).email = 'admin@example.com';
        (adminUser as any).isStaff = true;
        (adminUser as any).isSuperuser = true;
        (adminUser as any).isActive = true;
        
        await (adminUser as any).setPassword('admin');
        await (adminUser as any).save();
        console.log('✓ Superuser "admin" created successfully!');
    } else {
        console.log('\nDefault superuser "admin" already exists.');
        // Ensure active & password set to 'admin' to prevent login lockouts
        (adminUser as any).isActive = true;
        (adminUser as any).isStaff = true;
        (adminUser as any).isSuperuser = true;
        (adminUser as any).email = 'admin@example.com';
        await adminUser.setPassword('admin');
        await adminUser.save();
        console.log('✓ Ensured superuser "admin" is active, with password reset to "admin".');
    }
}

run()
    .catch(e => console.error('Error:', e))
    .finally(() => {
        process.exit(0);
    });
