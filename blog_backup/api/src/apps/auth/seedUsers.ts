import { User } from './models';

export async function seedAdminUser(): Promise<void> {
  const existing = await User.objects.get<any>({ email: 'admin@admin.com' });
  if (existing) {
    // Ensure the admin is active and superuser
    if (!existing.isActive || !existing.isSuperuser) {
      existing.isActive = 1;
      existing.isSuperuser = 1;
      existing.isStaff = 1;
      await existing.save();
    }
    return;
  }
  const admin = new User() as any;
  admin.username = 'admin';
  admin.email = 'admin@admin.com';
  admin.firstName = 'Admin';
  admin.lastName = '';
  admin.isActive = 1;
  admin.isStaff = 1;
  admin.isSuperuser = 1;
  await admin.setPassword('admin');
  await admin.save();
  console.log('[seed] Admin user created: admin@admin.com / admin');
}

export async function seedFakeUsers(): Promise<void> {
  // Check if fake users already exist
  const existing = await User.objects.get<any>({ username: 'user1' });
  if (existing) return;

  // ── 25 regular users ────────────────────────────────────────────────────────
  for (let i = 1; i <= 25; i++) {
    const username = `user${i}`;
    const email = `user${i}@user${i}.com`;

    const alreadyExists = await User.objects.get<any>({ email });
    if (alreadyExists) continue;

    const user = new User() as any;
    user.username = username;
    user.email = email;
    user.firstName = `User`;
    user.lastName = `${i}`;
    user.isActive = 1;
    user.isStaff = 0;
    user.isSuperuser = 0;
    await user.setPassword(`user${i}`);
    await user.save();
  }

  // ── 10 staff users ──────────────────────────────────────────────────────────
  for (let i = 1; i <= 10; i++) {
    const username = `staff${i}`;
    const email = `staff${i}@staff${i}.com`;

    const alreadyExists = await User.objects.get<any>({ email });
    if (alreadyExists) continue;

    const user = new User() as any;
    user.username = username;
    user.email = email;
    user.firstName = `Staff`;
    user.lastName = `${i}`;
    user.isActive = 1;
    user.isStaff = 1;
    user.isSuperuser = 0;
    await user.setPassword(`staff${i}`);
    await user.save();
  }
}
