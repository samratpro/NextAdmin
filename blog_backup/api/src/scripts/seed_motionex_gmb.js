const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../database.sqlite'));

try {
  // Ensure table exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS seo_gmb_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seoProjectId INTEGER NOT NULL,
      recordDate TEXT NOT NULL,
      taskType TEXT NOT NULL,
      taskName TEXT NOT NULL,
      url TEXT,
      details TEXT,
      status TEXT DEFAULT 'done',
      proofUrl TEXT,
      createdById INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    )
  `).run();

  const project = db.prepare('SELECT id FROM seo_projects WHERE websiteUrl LIKE ?').get('%motionexai%');
  if (!project) {
    console.error('Project "motionexai" not found!');
    process.exit(1);
  }

  const PROJECT_ID = project.id;
  const ADMIN_ID = 1;
  const createdAt = new Date().toISOString();

  const records = [
    ['2026-04-06', 'profile', 'Profile Optimization', 'https://motionexai.com', 'Updated category, added services, fixed hours for better local ranking.', 'done', 'https://drive.google.com/screenshot1'],
    ['2026-04-05', 'post', 'Weekly Offer Post', 'https://motionexai.com', 'Created offer post with CTA "Call Now" targeting local keywords.', 'done', 'https://business.google.com/post/123'],
    ['2026-04-04', 'review', 'Review Reply', null, 'Replied to 5 customer reviews (2 negative handled with brand tone).', 'done', 'https://drive.google.com/screenshot2'],
    ['2026-04-03', 'media', 'Photo Upload', null, 'Uploaded 10 new business images showing the interior and team.', 'done', 'https://drive.google.com/screenshot3'],
    ['2026-04-02', 'audit', 'GMB Audit', null, 'Profile completeness improved from 60% -> 85%. Optimized primary category.', 'done', 'https://drive.google.com/report1'],
  ];

  const insert = db.prepare(`
    INSERT INTO seo_gmb_activities 
    (seoProjectId, recordDate, taskType, taskName, url, details, status, proofUrl, createdById, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(...row, ADMIN_ID, createdAt);
    }
  });

  transaction(records);
  console.log(`Successfully seeded GMB records for project #${PROJECT_ID} (MotionEx AI).`);
} catch (err) {
  console.error('Failed to seed records:', err.message);
}
