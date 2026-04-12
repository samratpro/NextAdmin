import { GmbActivityRecord } from '../apps/seo/models';
import { subDays, format } from 'date-fns';

export async function manualSeedGmb() {
  const PROJECT_ID = 2; // Based on user screenshot in history
  const ADMIN_ID = 1;

  const gmbData = [
    { date: format(new Date(), 'yyyy-MM-dd'), type: 'profile', name: 'Profile Optimization', url: 'https://motionexai.com', status: 'done', details: 'Updated category, added services, fixed hours for better local ranking.', proof: 'https://drive.google.com/screenshot1' },
    { date: format(subDays(new Date(), 1), 'yyyy-MM-dd'), type: 'post', name: 'Weekly Offer Post', url: 'https://motionexai.com', status: 'done', details: 'Created offer post with CTA "Call Now" targeting local keywords.', proof: 'https://business.google.com/post/123' },
    { date: format(subDays(new Date(), 2), 'yyyy-MM-dd'), type: 'review', name: 'Review Reply', url: null, status: 'done', details: 'Replied to 5 customer reviews (2 negative handled with brand tone).', proof: 'https://drive.google.com/screenshot2' },
    { date: format(subDays(new Date(), 3), 'yyyy-MM-dd'), type: 'media', name: 'Photo Upload', url: null, status: 'done', details: 'Uploaded 10 new business images showing the interior and team.', proof: 'https://drive.google.com/screenshot3' },
    { date: format(subDays(new Date(), 4), 'yyyy-MM-dd'), type: 'audit', name: 'GMB Audit', url: null, status: 'done', details: 'Profile completeness improved from 60% -> 85%. Optimized primary category.', proof: 'https://drive.google.com/report1' },
  ];

  for (const d of gmbData) {
    try {
      await GmbActivityRecord.objects.create({
        seoProjectId: PROJECT_ID,
        recordDate: d.date,
        taskType: d.type,
        taskName: d.name,
        url: d.url,
        details: d.details,
        status: d.status,
        proofUrl: d.proof,
        createdById: ADMIN_ID,
      });
      console.log(`Created GMB record: ${d.name}`);
    } catch (err) {
      console.error(`Failed to create ${d.name}:`, err);
    }
  }
}

// If run directly via ts-node or similar
if (require.main === module) {
  manualSeedGmb().then(() => process.exit(0));
}
