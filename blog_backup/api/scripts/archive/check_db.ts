import DatabaseManager from './src/core/database';
import settings from './src/config/settings';

async function check() {
  DatabaseManager.initialize(settings.database);
  const db = DatabaseManager.getAdapter();
  
  const subs = await db.all('SELECT * FROM sub_subscriptions ORDER BY id DESC LIMIT 5');
  console.log('--- LATEST SUBSCRIPTIONS ---');
  console.log(JSON.stringify(subs, null, 2));

  const apps = await db.all('SELECT * FROM sub_apps');
  console.log('--- APPS ---');
  console.log(JSON.stringify(apps, null, 2));

  const plans = await db.all('SELECT * FROM sub_plans');
  console.log('--- PLANS ---');
  console.log(JSON.stringify(plans, null, 2));

  process.exit(0);
}

check().catch(console.error);
