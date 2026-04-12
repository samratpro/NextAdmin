const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'db.sqlite3');
const db = new sqlite3(dbPath);

console.log('--- Database Audit: Verifying Dynamic Features ---');

console.log('\n[App Subscriptions]');
const subPlans = db.prepare('SELECT name, featuresJson FROM sub_plans').all();
subPlans.forEach(p => console.log(`${p.name}: ${p.featuresJson}`));

console.log('\n[SEO Strategy Plans]');
const seoPlans = db.prepare('SELECT name, featuresJson FROM seo_plans').all();
seoPlans.forEach(p => console.log(`${p.name}: ${p.featuresJson}`));

db.close();
process.exit(0);
