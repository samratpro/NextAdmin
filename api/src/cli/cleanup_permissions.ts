import { Permission } from '../apps/auth/models';
import DatabaseManager from '../core/database';
import settings from '../config/settings';

// Initialize DB
DatabaseManager.initialize(settings.database.path);

console.log('--- Permissions Cleanup ---');

async function main() {
    try {
        const targetModel = 'Product';

        // Check count first
        const count = await Permission.objects.filter({ modelName: targetModel }).count();

        if (count > 0) {
            console.log(`Found ${count} stale permissions for '${targetModel}'. Deleting...`);
            const deleted = await Permission.objects.filter({ modelName: targetModel }).delete();
            console.log(`Successfully deleted ${deleted} permissions.`);
        } else {
            console.log(`No permissions found for '${targetModel}'.`);
        }

        // Also check lowercase just in case
        const targetLower = 'product';
        const countLower = await Permission.objects.filter({ modelName: targetLower }).count();
        if (countLower > 0) {
            console.log(`Found ${countLower} stale permissions for '${targetLower}'. Deleting...`);
            const deleted = await Permission.objects.filter({ modelName: targetLower }).delete();
            console.log(`Successfully deleted ${deleted} permissions.`);
        }

    } catch (e) {
        console.error('Error during cleanup:', e);
    }
    
    process.exit(0);
}

main();
