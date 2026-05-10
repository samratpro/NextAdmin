import readline from 'readline';

// Must be set BEFORE any module that uses the logger is imported.
// Static imports are hoisted above this line by Node, so we use
// dynamic import() below to load models/db AFTER this is set.
process.env.LOG_LEVEL = 'silent';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
});

// Git Bash / mintty pauses stdin by default — resume it so readline works
process.stdin.resume();

const question = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

async function run() {
    // Import and silence logger FIRST before any other app modules
    const { default: logger } = await import('../core/logger');
    logger.level = 'silent';

    // Now import models and other dependencies — their side effects (like model registration)
    // will now use the silenced logger.
    const [{ User }, { default: DatabaseManager }, { default: settings }] = await Promise.all([
        import('../apps/auth/models'),
        import('../core/database'),
        import('../config/settings'),
    ]);

    DatabaseManager.initialize(settings.database);
    await User.createTable();

    console.log('\n--- Create User ---');

    const username = await question('Username: ');
    if (!username.trim()) { console.error('Username is required'); return; }

    const email = await question('Email: ');
    if (!email.trim()) { console.error('Email is required'); return; }

    const password = await question('Password: ');
    if (!password.trim()) { console.error('Password is required'); return; }

    const role = await question('Role (admin/staff/user) [user]: ');

    let isSuperuser = false;
    let isStaff = false;
    const r = role.toLowerCase().trim();
    if (r === 'admin' || r === 'superuser') {
        isSuperuser = true;
        isStaff = true;
    } else if (r === 'staff') {
        isStaff = true;
    }

    // Check if user already exists
    let user = await User.objects.get<InstanceType<typeof User>>({ username: username.trim() });
    const isUpdate = !!user;

    if (isUpdate) {
        const confirm = await question(`\nUser "${username}" already exists. Update password and status? [Y/n]: `);
        if (confirm.toLowerCase().startsWith('n')) {
            console.log('Skipped.');
            return;
        }
        console.log(`\nUpdating user "${username}"...`);
    } else {
        user = new User();
        (user as any).username = username.trim();
    }

    (user as any).email = email.trim();
    (user as any).isStaff = isStaff;
    (user as any).isSuperuser = isSuperuser;
    (user as any).isActive = true;

    await user!.setPassword(password);
    await user!.save();

    console.log(`\n✓ User "${username}" ${isUpdate ? 'updated' : 'created'} successfully!`);
    console.log(`  Role: ${isSuperuser ? 'Superuser' : (isStaff ? 'Staff' : 'User')}`);
}

run()
    .catch(e => console.error('Error:', e))
    .finally(() => {
        rl.close();
        process.exit(0);
    });
