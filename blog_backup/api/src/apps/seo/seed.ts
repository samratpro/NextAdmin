import {
  SeoProject, SiteStatusRecord, OnPageRecord,
  TopicalMapTopic, TopicalMapRecord, OffPageRecord, GmbActivityRecord,
  SeoPlan
} from './models';

export async function seedSeoData(): Promise<void> {
  // Only seed if no records exist yet
  const existing = await SiteStatusRecord.objects.all().limit(1).all();
  
  // Seed Plans independently by name
  const plansToSeed = [
    {
      name: 'Lite SEO',
      description: 'Basic SEO monitoring for small sites.',
      priceUsdCents: 4900,
      billingType: 'monthly',
      stripePriceId: 'price_1TJJ2fHXZ0weIsjtJvHQs3VA',
      isActive: true
    },
    {
      name: 'Pro SEO',
      description: 'Advanced strategy, weekly reports, and backlink building.',
      priceUsdCents: 14900,
      billingType: 'monthly',
      stripePriceId: 'price_1TJJ4UHXZ0weIsjtrb5CMI4f',
      isActive: true
    }
  ];

  for (const p of plansToSeed) {
    const existingPlan = await SeoPlan.objects.get<any>({ name: p.name });
    if (!existingPlan) {
      await SeoPlan.objects.create(p);
      console.log(`[seed] Created SEO plan: ${p.name}`);
    } else {
      // Update stripePriceId if it changed
      if (existingPlan.stripePriceId !== p.stripePriceId) {
        existingPlan.stripePriceId = p.stripePriceId;
        await existingPlan.save();
        console.log(`[seed] Updated SEO plan price ID: ${p.name}`);
      }
    }
  }

  const existingRecords = await SiteStatusRecord.objects.all().limit(1).all();
  if (existingRecords.length > 0) return;

  // Auto-detect first project and first admin user
  const projects = await SeoProject.objects.all().limit(1).all() as any[];
  if (projects.length === 0) return; // No project to seed into

  const { User } = await import('../auth/models');
  const admins = await User.objects.filter({ isSuperuser: 1 }).all() as any[];
  if (admins.length === 0) return;

  const PROJECT_ID = projects[0].id;
  const ADMIN_ID = admins[0].id;
  const BASE_URL = 'https://motionexai.com';

  // ─── Site Status Records (12 months) ────────────────────────────────────────
  const siteStatusData = [
    { date: '2025-05-01', url: `${BASE_URL}/`, sc: 320, bing: 45, gmb: 80, other: 30, age: '2 years 1 month', note: 'Target: 500 SC traffic' },
    { date: '2025-06-01', url: `${BASE_URL}/`, sc: 410, bing: 52, gmb: 95, other: 38, age: '2 years 2 months', note: 'Target: 600 SC traffic' },
    { date: '2025-07-01', url: `${BASE_URL}/`, sc: 530, bing: 68, gmb: 110, other: 45, age: '2 years 3 months', note: 'Target: 700 SC traffic' },
    { date: '2025-08-01', url: `${BASE_URL}/`, sc: 620, bing: 74, gmb: 125, other: 52, age: '2 years 4 months', note: 'Target: 800 SC traffic' },
    { date: '2025-09-01', url: `${BASE_URL}/`, sc: 780, bing: 89, gmb: 140, other: 60, age: '2 years 5 months', note: 'Target: 1000 SC traffic' },
    { date: '2025-10-01', url: `${BASE_URL}/`, sc: 920, bing: 102, gmb: 160, other: 71, age: '2 years 6 months', note: 'Target: 1200 SC traffic' },
    { date: '2025-11-01', url: `${BASE_URL}/`, sc: 1100, bing: 118, gmb: 178, other: 85, age: '2 years 7 months', note: 'Target: 1400 SC traffic' },
    { date: '2025-12-01', url: `${BASE_URL}/`, sc: 1350, bing: 135, gmb: 195, other: 92, age: '2 years 8 months', note: 'Target: 1600 SC traffic' },
    { date: '2026-01-01', url: `${BASE_URL}/`, sc: 1580, bing: 148, gmb: 210, other: 104, age: '2 years 9 months', note: 'Target: 1800 SC traffic' },
    { date: '2026-02-01', url: `${BASE_URL}/`, sc: 1820, bing: 162, gmb: 228, other: 115, age: '2 years 10 months', note: 'Target: 2000 SC traffic' },
    { date: '2026-03-01', url: `${BASE_URL}/`, sc: 2140, bing: 180, gmb: 248, other: 128, age: '2 years 11 months', note: 'Target: 2500 SC traffic' },
    { date: '2026-04-01', url: `${BASE_URL}/`, sc: 2460, bing: 195, gmb: 265, other: 140, age: '3 years', note: 'Target: 3000 SC traffic' },
  ];

  for (const d of siteStatusData) {
    await SiteStatusRecord.objects.create({
      seoProjectId: PROJECT_ID,
      recordDate: d.date,
      url: d.url,
      scTraffic: d.sc,
      bingTraffic: d.bing,
      gmbTraffic: d.gmb,
      otherTraffic: d.other,
      siteAge: d.age,
      monthlyTargetNote: d.note,
      createdById: ADMIN_ID,
    });
  }

  // ─── On-Page Records ────────────────────────────────────────────────────────
  const onPageData = [
    { date: '2025-05-10', url: `${BASE_URL}/ai-tools`, traffic: 120, keyword: 'best ai tools for business', words: 2800, status: 'create_content', details: 'Wrote comprehensive guide covering 20+ AI tools with comparison table.' },
    { date: '2025-05-22', url: `${BASE_URL}/seo-automation`, traffic: 95, keyword: 'seo automation software', words: 2200, status: 'create_content', details: 'New pillar page targeting automation keywords.' },
    { date: '2025-06-05', url: `${BASE_URL}/machine-learning`, traffic: 310, keyword: 'machine learning for seo', words: 3100, status: 'update_content', details: 'Updated stats and added 3 new case studies from 2025.' },
    { date: '2025-06-18', url: `${BASE_URL}/content-strategy`, traffic: 88, keyword: 'ai content strategy 2025', words: 1900, status: 'create_content', details: 'Brand new article targeting Q3 2025 content planning searches.' },
    { date: '2025-07-02', url: `${BASE_URL}/keyword-research`, traffic: 445, keyword: 'keyword research tools free', words: 2600, status: 'update_content', details: 'Refreshed tool list, added Ahrefs vs Semrush comparison section.' },
    { date: '2025-07-15', url: `${BASE_URL}/technical-seo`, traffic: 210, keyword: 'technical seo audit checklist', words: 3400, status: 'fix_technical', details: 'Fixed broken links, improved Core Web Vitals, added schema markup.' },
    { date: '2025-08-08', url: `${BASE_URL}/backlink-building`, traffic: 175, keyword: 'backlink building strategies', words: 2900, status: 'create_content', details: 'New guide on modern link building techniques.' },
    { date: '2025-08-20', url: `${BASE_URL}/local-seo`, traffic: 390, keyword: 'local seo tips for small business', words: 2100, status: 'update_content', details: 'Added Google Business Profile optimization section.' },
    { date: '2025-09-03', url: `${BASE_URL}/page-speed`, traffic: 155, keyword: 'page speed optimization guide', words: 2450, status: 'fix_technical', details: 'Compressed images, deferred JS, improved LCP to 1.8s.' },
    { date: '2025-09-25', url: `${BASE_URL}/schema-markup`, traffic: 98, keyword: 'schema markup for seo', words: 1800, status: 'create_content', details: 'Complete guide to structured data implementation.' },
    { date: '2025-10-10', url: `${BASE_URL}/voice-search`, traffic: 142, keyword: 'voice search seo optimization', words: 2200, status: 'create_content', details: 'Targeting growing voice search queries with FAQ schema.' },
    { date: '2025-10-28', url: `${BASE_URL}/ai-tools`, traffic: 520, keyword: 'best ai tools for business', words: 3200, status: 'update_content', details: 'Major refresh with 2025 tools, added video content section.' },
    { date: '2025-11-12', url: `${BASE_URL}/ecommerce-seo`, traffic: 265, keyword: 'ecommerce seo best practices', words: 3000, status: 'create_content', details: 'New comprehensive guide for online store owners.' },
    { date: '2025-11-26', url: `${BASE_URL}/core-web-vitals`, traffic: 188, keyword: 'core web vitals guide 2025', words: 2700, status: 'fix_technical', details: 'Resolved CLS issues, improved INP score across product pages.' },
    { date: '2025-12-08', url: `${BASE_URL}/content-clusters`, traffic: 220, keyword: 'content cluster strategy', words: 2500, status: 'create_content', details: 'Pillar-cluster model guide with real examples.' },
    { date: '2026-01-14', url: `${BASE_URL}/seo-automation`, traffic: 380, keyword: 'seo automation software', words: 2800, status: 'update_content', details: 'Updated with 6 new tools launched in Q4 2025.' },
    { date: '2026-02-05', url: `${BASE_URL}/google-analytics`, traffic: 430, keyword: 'google analytics 4 seo', words: 2300, status: 'create_content', details: 'GA4 SEO tracking guide with event setup instructions.' },
    { date: '2026-02-22', url: `${BASE_URL}/mobile-seo`, traffic: 195, keyword: 'mobile seo optimization', words: 2100, status: 'fix_technical', details: 'Fixed mobile viewport issues, improved tap targets.' },
    { date: '2026-03-10', url: `${BASE_URL}/international-seo`, traffic: 148, keyword: 'international seo hreflang', words: 2900, status: 'create_content', details: 'Complete hreflang implementation guide with examples.' },
    { date: '2026-03-28', url: `${BASE_URL}/ai-overview-seo`, traffic: 310, keyword: 'seo for ai overviews', words: 2600, status: 'create_content', details: 'Targeting the growing "AI overview" optimization niche.' },
  ];

  for (const d of onPageData) {
    await OnPageRecord.objects.create({
      seoProjectId: PROJECT_ID,
      recordDate: d.date,
      url: d.url,
      traffic: d.traffic,
      keywordPicked: d.keyword,
      wordCount: d.words,
      taskStatus: d.status,
      workedDetails: d.details,
      createdById: ADMIN_ID,
    });
  }

  // ─── Topical Map Topics ──────────────────────────────────────────────────────
  const topicNames = ['AI & SEO', 'Technical SEO', 'Content Strategy', 'Link Building', 'Local SEO'];
  const topicIds: number[] = [];

  for (const name of topicNames) {
    const topic = await TopicalMapTopic.objects.create({
      seoProjectId: PROJECT_ID,
      mainTopicName: name,
    }) as any;
    topicIds.push(topic.id);
  }

  // ─── Topical Map Records ─────────────────────────────────────────────────────
  const topicalData = [
    // AI & SEO (topicIds[0])
    { topicIdx: 0, date: '2025-06-01', sub: 'AI tools for keyword research', url: `${BASE_URL}/ai-keyword-research`, vol: 3400, words: 2500, link: null },
    { topicIdx: 0, date: '2025-07-01', sub: 'ChatGPT for SEO content writing', url: `${BASE_URL}/chatgpt-seo`, vol: 5600, words: 2200, link: `${BASE_URL}/ai-tools` },
    { topicIdx: 0, date: '2025-08-01', sub: 'Machine learning ranking factors', url: `${BASE_URL}/ml-ranking`, vol: 1800, words: 2800, link: null },
    { topicIdx: 0, date: '2025-09-01', sub: 'AI-generated content SEO risks', url: `${BASE_URL}/ai-content-risks`, vol: 2900, words: 2100, link: `${BASE_URL}/content-strategy` },
    { topicIdx: 0, date: '2025-10-01', sub: 'Automated SEO reporting tools', url: `${BASE_URL}/seo-reporting-ai`, vol: 1600, words: 1900, link: null },
    // Technical SEO (topicIds[1])
    { topicIdx: 1, date: '2025-06-15', sub: 'XML sitemap optimization', url: `${BASE_URL}/xml-sitemap-guide`, vol: 2200, words: 1800, link: null },
    { topicIdx: 1, date: '2025-07-15', sub: 'Canonical tags best practices', url: `${BASE_URL}/canonical-tags`, vol: 3100, words: 2400, link: `${BASE_URL}/technical-seo` },
    { topicIdx: 1, date: '2025-08-15', sub: 'JavaScript SEO challenges', url: `${BASE_URL}/javascript-seo`, vol: 2700, words: 3000, link: null },
    { topicIdx: 1, date: '2025-09-15', sub: 'Crawl budget optimization', url: `${BASE_URL}/crawl-budget`, vol: 1400, words: 2100, link: null },
    { topicIdx: 1, date: '2025-11-01', sub: 'Core Web Vitals improvement guide', url: `${BASE_URL}/cwv-guide`, vol: 4200, words: 2700, link: `${BASE_URL}/core-web-vitals` },
    // Content Strategy (topicIds[2])
    { topicIdx: 2, date: '2025-07-10', sub: 'Content calendar for SEO', url: `${BASE_URL}/seo-content-calendar`, vol: 2600, words: 2000, link: null },
    { topicIdx: 2, date: '2025-08-10', sub: 'Pillar page vs cluster content', url: `${BASE_URL}/pillar-cluster`, vol: 3800, words: 2800, link: `${BASE_URL}/content-clusters` },
    { topicIdx: 2, date: '2025-09-10', sub: 'Content gap analysis step by step', url: `${BASE_URL}/content-gap-analysis`, vol: 2100, words: 2300, link: null },
    { topicIdx: 2, date: '2025-10-10', sub: 'Topic authority building', url: `${BASE_URL}/topic-authority`, vol: 1700, words: 2600, link: null },
    { topicIdx: 2, date: '2025-12-10', sub: 'Refreshing old content for traffic', url: `${BASE_URL}/content-refresh-strategy`, vol: 4500, words: 2200, link: `${BASE_URL}/content-strategy` },
    // Link Building (topicIds[3])
    { topicIdx: 3, date: '2025-06-20', sub: 'Guest posting outreach templates', url: `${BASE_URL}/guest-post-outreach`, vol: 3200, words: 2100, link: null },
    { topicIdx: 3, date: '2025-08-20', sub: 'HARO link building guide', url: `${BASE_URL}/haro-guide`, vol: 2800, words: 2400, link: `${BASE_URL}/backlink-building` },
    { topicIdx: 3, date: '2025-10-20', sub: 'Broken link building tactics', url: `${BASE_URL}/broken-link-building`, vol: 1900, words: 2000, link: null },
    { topicIdx: 3, date: '2026-01-20', sub: 'Digital PR for backlinks', url: `${BASE_URL}/digital-pr-backlinks`, vol: 2400, words: 2700, link: null },
    // Local SEO (topicIds[4])
    { topicIdx: 4, date: '2025-07-25', sub: 'Google Business Profile optimization', url: `${BASE_URL}/gbp-optimization`, vol: 5100, words: 2300, link: `${BASE_URL}/local-seo` },
    { topicIdx: 4, date: '2025-09-25', sub: 'Local citation building guide', url: `${BASE_URL}/local-citations`, vol: 2900, words: 2000, link: null },
    { topicIdx: 4, date: '2025-11-25', sub: 'Review generation strategies', url: `${BASE_URL}/review-generation`, vol: 3400, words: 2100, link: null },
    { topicIdx: 4, date: '2026-02-25', sub: 'Local schema markup implementation', url: `${BASE_URL}/local-schema`, vol: 1800, words: 2400, link: `${BASE_URL}/schema-markup` },
  ];

  for (const d of topicalData) {
    await TopicalMapRecord.objects.create({
      seoProjectId: PROJECT_ID,
      recordDate: d.date,
      mainTopicId: topicIds[d.topicIdx],
      subTopicName: d.sub,
      url: d.url,
      searchVolume: d.vol,
      wordCount: d.words,
      providedLinkUrl: d.link,
      createdById: ADMIN_ID,
    });
  }

  // ─── Off-Page Records ────────────────────────────────────────────────────────
  const offPageData = [
    { date: '2025-05-15', type: 'guest_post', src: 'https://searchengineland.com', anchor: 'AI SEO tools', received: `${BASE_URL}/ai-tools`, words: 1200, user: 'john_doe', email: 'john@searchengineland.com', pass: 'Demo@2025!' },
    { date: '2025-05-28', type: 'directory', src: 'https://clutch.co', anchor: 'MotionEx AI', received: `${BASE_URL}/`, words: 0, user: null, email: 'listings@clutch.co', pass: null },
    { date: '2025-06-10', type: 'guest_post', src: 'https://moz.com/blog', anchor: 'machine learning seo', received: `${BASE_URL}/ml-ranking`, words: 1500, user: 'motionex_contributor', email: 'contribute@moz.com', pass: 'Moz@Guest25' },
    { date: '2025-06-22', type: 'social', src: 'https://linkedin.com/company/motionexai', anchor: 'MotionEx AI official page', received: `${BASE_URL}/`, words: 0, user: 'motionexai', email: null, pass: null },
    { date: '2025-07-08', type: 'forum', src: 'https://reddit.com/r/SEO', anchor: 'check out this technical seo guide', received: `${BASE_URL}/technical-seo`, words: 150, user: 'u/motionex_team', email: null, pass: null },
    { date: '2025-07-20', type: 'guest_post', src: 'https://ahrefs.com/blog', anchor: 'keyword research with AI', received: `${BASE_URL}/ai-keyword-research`, words: 1800, user: 'guest_motionex', email: 'blog@ahrefs.com', pass: 'Ahrefs@2025' },
    { date: '2025-08-05', type: 'directory', src: 'https://g2.com', anchor: 'MotionEx AI - SEO Software', received: `${BASE_URL}/`, words: 0, user: 'motionex_admin', email: 'reviews@g2.com', pass: 'G2List@2025' },
    { date: '2025-08-18', type: 'comment', src: 'https://neilpatel.com/blog/seo-trends', anchor: 'Great read! We wrote about AI overview SEO too', received: `${BASE_URL}/ai-overview-seo`, words: 80, user: null, email: null, pass: null },
    { date: '2025-09-02', type: 'guest_post', src: 'https://semrush.com/blog', anchor: 'content cluster strategy guide', received: `${BASE_URL}/content-clusters`, words: 2100, user: 'motionex_writer', email: 'guestpost@semrush.com', pass: 'Semrush@G25' },
    { date: '2025-09-14', type: 'social', src: 'https://twitter.com/motionexai', anchor: 'MotionEx AI on X', received: `${BASE_URL}/`, words: 0, user: '@motionexai', email: null, pass: null },
    { date: '2025-10-05', type: 'guest_post', src: 'https://backlinko.com', anchor: 'backlink building in 2025', received: `${BASE_URL}/backlink-building`, words: 2400, user: 'motionex_seo', email: 'contribute@backlinko.com', pass: 'BkLink@2025' },
    { date: '2025-10-19', type: 'directory', src: 'https://capterra.com', anchor: 'MotionEx AI SEO Platform', received: `${BASE_URL}/`, words: 0, user: 'motionex_capterra', email: 'listings@capterra.com', pass: 'Cap@2025!' },
    { date: '2025-11-07', type: 'forum', src: 'https://blackhatworld.com/seo-forums', anchor: 'local seo strategy thread', received: `${BASE_URL}/local-seo`, words: 200, user: 'motionex_seo_forum', email: null, pass: null },
    { date: '2025-11-20', type: 'guest_post', src: 'https://contentmarketinginstitute.com', anchor: 'AI content strategy 2025', received: `${BASE_URL}/content-strategy`, words: 1900, user: 'motionex_content', email: 'submissions@cmi.com', pass: 'CMI@Submit25' },
    { date: '2025-12-03', type: 'other', src: 'https://podcastseo.com/show/ep142', anchor: 'MotionEx AI interview', received: `${BASE_URL}/`, words: 0, user: null, email: 'host@podcastseo.com', pass: null },
    { date: '2025-12-15', type: 'guest_post', src: 'https://searchenginejournal.com', anchor: 'voice search optimization tips', received: `${BASE_URL}/voice-search`, words: 1600, user: 'sej_contributor_mex', email: 'contribute@sej.com', pass: 'SEJ@2025Gst' },
    { date: '2026-01-08', type: 'directory', src: 'https://producthunt.com', anchor: 'MotionEx AI - Featured Tool', received: `${BASE_URL}/`, words: 0, user: 'motionex_ph', email: 'hello@producthunt.com', pass: 'PH@Launch26' },
    { date: '2026-01-22', type: 'guest_post', src: 'https://hubspot.com/marketing/blog', anchor: 'GA4 SEO tracking guide', received: `${BASE_URL}/google-analytics`, words: 1700, user: 'hubspot_guest_mex', email: 'guestpost@hubspot.com', pass: 'HS@Guest26' },
    { date: '2026-02-10', type: 'social', src: 'https://youtube.com/@motionexai', anchor: 'MotionEx AI YouTube Channel', received: `${BASE_URL}/`, words: 0, user: 'motionexai', email: null, pass: null },
    { date: '2026-03-05', type: 'guest_post', src: 'https://yoast.com/blog', anchor: 'international SEO hreflang', received: `${BASE_URL}/international-seo`, words: 2000, user: 'yoast_guest_mex', email: 'contribute@yoast.com', pass: 'Yoast@26Gst' },
  ];

  // Import encrypt from service (use a simple placeholder since we don't have the key here)
  const seoService = (await import('./service')).default;

  for (const d of offPageData) {
    await OffPageRecord.objects.create({
      seoProjectId: PROJECT_ID,
      recordDate: d.date,
      backlinkType: d.type,
      sourceUrl: d.src,
      anchorText: d.anchor,
      receivedLinkUrl: d.received,
      wordCount: d.words,
      username: d.user,
      email: d.email,
      password: d.pass ? seoService.encrypt(d.pass) : null,
      createdById: ADMIN_ID,
    });
  }

  // ─── GMB Activity Records ──────────────────────────────────────────────────
  const gmbData = [
    { date: '2026-04-06', type: 'profile', name: 'Profile Optimization', url: `${BASE_URL}`, status: 'done', details: 'Updated category, added services, fixed hours for better local ranking.', proof: 'https://drive.google.com/screenshot1' },
    { date: '2026-04-05', type: 'post', name: 'Weekly Offer Post', url: `${BASE_URL}`, status: 'done', details: 'Created offer post with CTA "Call Now" targeting local keywords.', proof: 'https://business.google.com/post/123' },
    { date: '2026-04-04', type: 'review', name: 'Review Reply', url: null, status: 'done', details: 'Replied to 5 customer reviews (2 negative handled with brand tone).', proof: 'https://drive.google.com/screenshot2' },
    { date: '2026-04-03', type: 'media', name: 'Photo Upload', url: null, status: 'done', details: 'Uploaded 10 new business images showing the interior and team.', proof: 'https://drive.google.com/screenshot3' },
    { date: '2026-04-02', type: 'audit', name: 'GMB Audit', url: null, status: 'done', details: 'Profile completeness improved from 60% -> 85%. Optimized primary category.', proof: 'https://drive.google.com/report1' },
  ];

  for (const d of gmbData) {
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
  }
}
