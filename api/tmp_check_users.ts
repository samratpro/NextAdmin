import DatabaseManager from './src/core/database.js';
import { User } from './src/apps/auth/models.js';
import settings from './src/config/settings.js';

async function check() {
    try {
        DatabaseManager.initialize(settings.database.path);
        const users = await User.objects.all();
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();
