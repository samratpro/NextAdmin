const Database = require('better-sqlite3');
const path = require('path');

try {
  const db = new Database(path.join(__dirname, '../../database.sqlite'));

  const PROJECT_ID = 2; // Based on user screenshot showing #2
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
  console.log("Successfully seeded GMB records.");
} catch (err) {
  console.error("Failed to seed records:", err.message);
  console.log("Note: if table doesn't exist, project needs to restart or run migrations.");
}
