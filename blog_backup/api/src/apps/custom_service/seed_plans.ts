import { CustomServicePlan } from './models';

async function seed() {
  console.log('Seeding Custom Service Plans...');

  const plans = [
    {
      name: 'WordPress Website Design',
      priceUsdCents: 20000,
      stripePriceId: 'price_1TJhstHXZ0weIsjtBmjIqRpj'
    },
    {
      name: 'GMB Data Scraping',
      priceUsdCents: 10000,
      stripePriceId: 'price_1TJhuAHXZ0weIsjtrqA0xrr6'
    },
    {
      name: 'SEO Tools Development',
      priceUsdCents: 50000,
      stripePriceId: 'price_1TJhvTHXZ0weIsjty3jjOHUo'
    }
  ];

  for (const p of plans) {
    const existing = await CustomServicePlan.objects.get({ name: p.name });
    if (existing) {
      console.log(`Plan ${p.name} already exists, updating...`);
      Object.assign(existing, p);
      await (existing as any).save();
    } else {
      console.log(`Creating plan ${p.name}...`);
      await CustomServicePlan.objects.create(p);
    }
  }

  console.log('Seeding complete.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
