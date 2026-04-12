const Database = require('better-sqlite3');
const db = new Database('./db.sqlite3');

function check() {
  try {
    const info = db.prepare('PRAGMA table_info(sub_subscriptions)').all();
    console.log('--- sub_subscriptions columns ---');
    console.log(JSON.stringify(info, null, 2));

    const infoPlans = db.prepare('PRAGMA table_info(sub_plans)').all();
    console.log('--- sub_plans columns ---');
    console.log(JSON.stringify(infoPlans, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
}

check();
