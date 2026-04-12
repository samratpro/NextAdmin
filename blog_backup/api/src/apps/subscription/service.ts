import { App, Plan, Subscription, DeviceSession, AppRecord, PlanRecord, SubscriptionRecord, DeviceSessionRecord } from './models';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

class SubscriptionService {
  // --- App Management ---
  async getAppBySlug(slug: string): Promise<AppRecord | null> {
    return await App.objects.get<AppRecord>({ slug });
  }

  // --- Plan Management ---
  async getPlansByAppId(appId: number): Promise<PlanRecord[]> {
    return await Plan.objects.filter<PlanRecord>({ appId, isActive: true }).all();
  }

  // --- Subscription Management ---
  async getUserSubscription(userId: number, appId: number): Promise<SubscriptionRecord | null> {
    return await Subscription.objects.get<SubscriptionRecord>({ userId, appId });
  }

  async createInitialSubscription(userId: number, appId: number, planId: number): Promise<SubscriptionRecord> {
    const plan = await Plan.objects.get<PlanRecord>({ id: planId });
    if (!plan) throw new Error('Plan not found');

    const subscription = new Subscription() as unknown as SubscriptionRecord;
    subscription.userId = userId;
    subscription.appId = appId;
    subscription.planId = planId;
    subscription.status = 'active';
    (subscription as any).creditsRemaining = plan.monthlyCredits;
    (subscription as any).totalCreditsLimit = plan.monthlyCredits;
    subscription.creditsGrantedAt = new Date().toISOString();
    
    await (subscription as any).save();
    return subscription;
  }

  // --- Credit Management ---
  async useCredit(userId: number, appId: number, _taskName: string, _deviceId?: string): Promise<{ success: boolean; creditsRemaining?: number; error?: string }> {
    const subscription = await this.getUserSubscription(userId, appId);

    if (!subscription) {
      return { success: false, error: 'No active subscription found' };
    }

    if (subscription.creditsRemaining <= 0) {
      return { success: false, error: 'Insufficient credits' };
    }

    // Deduct credit, increment total used, and stamp the time
    subscription.creditsRemaining -= 1;
    subscription.totalCreditsUsed += 1;
    subscription.lastCreditUsedAt = new Date().toISOString();
    await (subscription as any).save();

    return { success: true, creditsRemaining: subscription.creditsRemaining };
  }

  // --- Device Management ---
  async loginDevice(
    userId: number,
    appId: number,
    deviceId: string,
    deviceName?: string,
    deviceInfo?: { os?: string; ipAddress?: string | null; macAddress?: string },
  ): Promise<{ success: boolean; appToken?: string; error?: string; lockedUntilAt?: string }> {
    // 1. Strictly require an active subscription
    const subscription = await this.getUserSubscription(userId, appId);
    if (!subscription || subscription.status !== 'active') {
      return { success: false, error: 'Active subscription required to use this app.' };
    }

    const activeSessions = await DeviceSession.objects.filter<DeviceSessionRecord>({ userId, appId }).all();

    // 2. DELETE ANY previous session for the SAME device first
    const existingSameDevice = activeSessions.find(s => s.deviceId === deviceId);
    if (existingSameDevice) {
      await (existingSameDevice as any).delete();
    }

    // 3. Check if any OTHER device session is still locked
    const lockedSession = activeSessions.find((s: any) => 
      s.deviceId !== deviceId && // Ignore current device
      s.lockedUntilAt && 
      new Date() < new Date(s.lockedUntilAt)
    );

    if (lockedSession) {
      return {
        success: false,
        error: `Another device session is locked until ${new Date((lockedSession as any).lockedUntilAt).toLocaleString()}. You cannot login on a new device until the lock expires.`,
        lockedUntilAt: (lockedSession as any).lockedUntilAt,
      };
    }

    // 4. Check device concurrency limit (all rules come from the plan)
    const plan = await Plan.objects.get<PlanRecord>({ id: subscription.planId });

    const maxConcurrentDevices = plan?.maxConcurrentDevices ?? 1;
    const allowMultiDevice = plan?.allowMultiDevice ?? false;

    // Recalculate remaining active sessions (excluding the one we just deleted for this device)
    const otherActiveSessions = activeSessions.filter(s => s.deviceId !== deviceId);

    if (otherActiveSessions.length >= maxConcurrentDevices) {
      if (!allowMultiDevice) {
        return { success: false, error: 'Maximum concurrent devices reached. Please logout from another device.' };
      }
    }

    // 5. Generate app token
    const rawToken = uuidv4();
    const appToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    let lockedUntilAt: string | null = null;

    if (plan?.deviceLockMinutes) {
      lockedUntilAt = new Date(now.getTime() + plan.deviceLockMinutes * 60000).toISOString();
    }

    await DeviceSession.objects.create({
      userId,
      appId,
      deviceId,
      deviceName: deviceName || null,
      appToken,
      os: deviceInfo?.os || null,
      ipAddress: deviceInfo?.ipAddress || null,
      macAddress: deviceInfo?.macAddress || null,
      loginAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      lockedUntilAt,
    });

    return {
      success: true,
      appToken,
      lockedUntilAt: lockedUntilAt || undefined,
    };
  }

  async validateSession(appToken: string): Promise<DeviceSessionRecord | null> {
    const session = await DeviceSession.objects.get<DeviceSessionRecord>({ appToken });
    if (!session) return null;

    // Update last seen
    session.lastSeenAt = new Date().toISOString();
    await (session as any).save();

    return session;
  }

  async logoutDevice(appToken: string): Promise<{ success: boolean; lockedUntil?: string; error?: string }> {
    const session = await DeviceSession.objects.get<DeviceSessionRecord>({ appToken });
    if (!session) return { success: true };

    // Enforce plan device lock — cannot logout before lockedUntilAt
    if (session.lockedUntilAt && new Date() < new Date(session.lockedUntilAt)) {
      return {
        success: false,
        lockedUntil: session.lockedUntilAt,
        error: `Device session is locked until ${new Date(session.lockedUntilAt).toLocaleString()}. You cannot logout before this time.`,
      };
    }

    await (session as any).delete();
    return { success: true };
  }

  /** User logout session by ID — respects the lock. */
  async logoutSessionById(userId: number, id: number): Promise<{ success: boolean; lockedUntil?: string; error?: string }> {
    const session = await DeviceSession.objects.get<DeviceSessionRecord>({ id, userId });
    if (!session) return { success: true };

    // Enforce plan device lock — cannot logout before lockedUntilAt
    if (session.lockedUntilAt && new Date() < new Date(session.lockedUntilAt)) {
      return {
        success: false,
        lockedUntil: session.lockedUntilAt,
        error: `Device session is locked until ${new Date(session.lockedUntilAt).toLocaleString()}. You cannot logout before this time.`,
      };
    }

    await (session as any).delete();
    return { success: true };
  }

  /** Admin force-logout — bypasses the lock. */
  async forceLogoutDevice(id: number): Promise<void> {
    const session = await DeviceSession.objects.get<DeviceSessionRecord>({ id });
    if (session) {
      await (session as any).delete();
    }
  }

  async checkStatus(userId: number, appId: number): Promise<{ 
    success: boolean; 
    subscriptionActive: boolean; 
    concurrencyFull: boolean; 
    maxDevices: number; 
    activeDevices: number; 
    lockedUntilAt: string | null;
    error?: string;
  }> {
    const subscription = await this.getUserSubscription(userId, appId);
    if (!subscription || subscription.status !== 'active') {
      return { 
        success: false, 
        subscriptionActive: false, 
        concurrencyFull: false, 
        maxDevices: 0, 
        activeDevices: 0, 
        lockedUntilAt: null,
        error: 'No active subscription found.' 
      };
    }

    const activeSessions = await DeviceSession.objects.filter<DeviceSessionRecord>({ userId, appId }).all();
    const plan = await Plan.objects.get<PlanRecord>({ id: subscription.planId });

    const maxConcurrentDevices = plan?.maxConcurrentDevices ?? 1;
    const lockedSession = activeSessions.find(s => s.lockedUntilAt && new Date() < new Date(s.lockedUntilAt));
    
    return {
      success: true,
      subscriptionActive: true,
      concurrencyFull: activeSessions.length >= maxConcurrentDevices,
      maxDevices: maxConcurrentDevices,
      activeDevices: activeSessions.length,
      lockedUntilAt: lockedSession?.lockedUntilAt || null,
    };
  }

  // --- Demo Seed ---
  async seedDemoData(): Promise<void> {
    const existing = await App.objects.get<AppRecord>({ slug: 'seo-spider' });
    if (existing) return; // already seeded

    const app = await App.objects.create<AppRecord>({
      name: 'SEO Spider',
      slug: 'seo-spider',
      description: 'Powerful SEO crawling and analysis tool. Audit your website, track keywords, analyze backlinks, and monitor site health — all in one place.',
      isActive: true,
    });

    await Plan.objects.create({
      appId: app.id,
      name: 'Free',
      isFree: true,
      monthlyCredits: 100,
      priceUsdCents: 0,
      isActive: true,
    });

    await Plan.objects.create({
      appId: app.id,
      name: 'Pro',
      isFree: false,
      monthlyCredits: 5000,
      priceUsdCents: 1900, // $19/month
      stripePriceId: 'price_demo_pro_monthly',
      isActive: true,
    });
  }

  // --- Subscribe (with Credit Merging & Period Extension) ---
  async subscribeToPlan(userId: number, appId: number, planId: number): Promise<SubscriptionRecord> {
    const plan = await Plan.objects.get<PlanRecord>({ id: planId });
    if (!plan) throw new Error('Plan not found');

    const existing = await this.getUserSubscription(userId, appId);

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (existing) {
      // Upgrade: Merge credits and extend time
      existing.planId = planId;
      existing.status = 'active';
      
      // If totalCreditsLimit is 0 (uninitialized for existing users), initialize it from currentPlan or current remaining
      if (!(existing as any).totalCreditsLimit) {
         const currentPlan = await Plan.objects.get<PlanRecord>({ id: existing.planId });
         (existing as any).totalCreditsLimit = currentPlan?.monthlyCredits || existing.creditsRemaining || 0;
      }

      // Merge: Add new plan credits to existing balance AND total limit
      (existing as any).creditsRemaining = (existing.creditsRemaining || 0) + plan.monthlyCredits;
      (existing as any).totalCreditsLimit = (existing.totalCreditsLimit || 0) + plan.monthlyCredits;
      
      existing.creditsGrantedAt = new Date().toISOString();
      existing.currentPeriodEnd = periodEnd.toISOString();
      existing.updatedAt = new Date().toISOString();
      await (existing as any).save();

      return existing;
    }

    const sub = await this.createInitialSubscription(userId, appId, planId);

    // Set period end
    sub.currentPeriodEnd = periodEnd.toISOString();
    await (sub as any).save();

    return sub;
  }
}

export default new SubscriptionService();
