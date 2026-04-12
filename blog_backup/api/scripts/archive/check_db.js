const Database = require('better-sqlite3');
const db = new Database('./db.sqlite3');

function check() {
  try {
    const subs = db.prepare('SELECT * FROM sub_subscriptions ORDER BY id DESC LIMIT 5').all();
    console.log('--- LATEST SUBSCRIPTIONS ---');
    console.log(JSON.stringify(subs, null, 2));

    const apps = db.prepare('SELECT * FROM sub_apps').all();
    console.log('--- APPS ---');
    console.log(JSON.stringify(apps, null, 2));

    const plans = db.prepare('SELECT * FROM sub_plans').all();
    console.log('--- PLANS ---');
    console.log(JSON.stringify(plans, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
}

check();
