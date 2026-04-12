import { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperuser } from '../../middleware/auth';
import subscriptionService from './service';
import { App, Plan, Subscription, DeviceSession, AppRecord, PlanRecord, SubscriptionRecord, DeviceSessionRecord } from './models';
import { z } from 'zod';
import { User } from '../auth/models';
import Stripe from 'stripe';
import settings from '../../config/settings';

const getStripe = () => {
  if (!settings.stripe.secretKey) {
    return null;
  }
  return new Stripe(settings.stripe.secretKey, {
    apiVersion: '2025-01-27.acacia' as any,
  });
};

const appLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  appId: z.coerce.number().optional(),
  appSlug: z.string().optional(),
  deviceId: z.string(),
  deviceName: z.string().optional(),
  os: z.string().max(255).optional(),
  macAddress: z.string().max(100).optional(),
});

const preCheckSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  appId: z.coerce.number().optional(),
  appSlug: z.string().optional(),
});

const useCreditSchema = z.object({
  appToken: z.string(),
  taskName: z.string()
});

const checkoutSchema = z.object({
  appId: z.number(),
  planId: z.number()
});

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  // --- Admin Endpoints (requireSuperuser) ---

  // List all apps
  fastify.get('/api/admin/apps', { preHandler: requireSuperuser }, async (_request, reply) => {
    const apps = await App.objects.all<AppRecord>().all();
    reply.send({ apps });
  });

  // Create app
  fastify.post('/api/admin/apps', { preHandler: requireSuperuser }, async (request, reply) => {
    const data = request.body as Partial<AppRecord>;
    const app = await App.objects.create(data);
    reply.code(201).send({ app });
  });

  // Get single app
  fastify.get('/api/admin/apps/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const app = await App.objects.get<AppRecord>({ id: parseInt(id) });
    if (!app) return reply.code(404).send({ error: 'App not found' });
    reply.send({ app });
  });

  // Update app
  fastify.put('/api/admin/apps/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const app = await App.objects.get<AppRecord>({ id: parseInt(id) });
    if (!app) return reply.code(404).send({ error: 'App not found' });
    Object.assign(app, request.body);
    await (app as any).save();
    reply.send({ app });
  });

  // List plans for app
  fastify.get('/api/admin/apps/:appId/plans', { preHandler: requireSuperuser }, async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const plans = await Plan.objects.filter<PlanRecord>({ appId: parseInt(appId) }).all();
    reply.send({ plans });
  });

  // Create plan for app
  fastify.post('/api/admin/apps/:appId/plans', { preHandler: requireSuperuser }, async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const data = request.body as Partial<PlanRecord>;
    const plan = await Plan.objects.create({ ...data, appId: parseInt(appId) });
    reply.code(201).send({ plan });
  });

  // List all subscriptions (admin) - enriched with username, email, app name, plan name
  fastify.get('/api/admin/subscriptions', { preHandler: requireSuperuser }, async (_request, reply) => {
    const subscriptions = await Subscription.objects.all<SubscriptionRecord>().orderBy('createdAt', 'DESC').all();

    const userIds = [...new Set(subscriptions.map((s: any) => s.userId))];
    const appIds = [...new Set(subscriptions.map((s: any) => s.appId))];
    const planIds = [...new Set(subscriptions.map((s: any) => s.planId))];

    const [users, apps, plans] = await Promise.all([
      Promise.all(userIds.map((id) => User.objects.get<any>({ id }))),
      Promise.all(appIds.map((id) => App.objects.get<AppRecord>({ id }))),
      Promise.all(planIds.map((id) => Plan.objects.get<PlanRecord>({ id }))),
    ]);

    const userMap = new Map(users.filter(Boolean).map((u: any) => [u.id, { username: u.username, email: u.email }]));
    const appMap = new Map(apps.filter(Boolean).map((a: any) => [a.id, a.name]));
    const planMap = new Map(plans.filter(Boolean).map((p: any) => [p.id, p.name]));

    const enriched = subscriptions.map((s: any) => ({
      ...s,
      username: userMap.get(s.userId)?.username ?? '—',
      email: userMap.get(s.userId)?.email ?? '—',
      appName: appMap.get(s.appId) ?? '—',
      planName: planMap.get(s.planId) ?? '—',
    }));

    reply.send({ subscriptions: enriched });
  });

  // List all device sessions (admin) - enriched with username, email, and app name
  fastify.get('/api/admin/devices', { preHandler: requireSuperuser }, async (_request, reply) => {
    const devices = await DeviceSession.objects.all<DeviceSessionRecord>().orderBy('loginAt', 'DESC').all();

    const userIds = [...new Set(devices.map((d: any) => d.userId))];
    const appIds = [...new Set(devices.map((d: any) => d.appId))];

    const [users, apps] = await Promise.all([
      Promise.all(userIds.map((uid) => User.objects.get<any>({ id: uid }))),
      Promise.all(appIds.map((id) => App.objects.get<AppRecord>({ id }))),
    ]);

    const userMap = new Map(users.filter(Boolean).map((u: any) => [u.id, { username: u.username, email: u.email }]));
    const appMap = new Map(apps.filter(Boolean).map((a: any) => [a.id, a.name]));

    const enriched = devices.map((d: any) => ({
      ...d,
      username: userMap.get(d.userId)?.username ?? '—',
      email: userMap.get(d.userId)?.email ?? '—',
      appName: appMap.get(d.appId) ?? '—',
    }));

    reply.send({ devices: enriched });
  });

  // Diagnostic Endpoint (Temporary - Public for development check)
  fastify.get('/api/debug/db', async (_request, reply) => {
    const db = await import('../../core/database');
    const adapter = (db.default as any).getAdapter();
    const users = await adapter.all('SELECT id, email, password FROM users');
    reply.send({ users });
  });
 
  // --- Stripe Session Verification (Synchronous Handshake) ---
  fastify.post('/api/subscription/verify-session', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const stripe = getStripe();
      if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
      const { sessionId } = request.body as { sessionId: string };
      if (!sessionId) return reply.code(400).send({ error: 'Session ID is required' });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return reply.code(400).send({ error: 'Payment not completed' });
      }

      const { appId, planId, userId, app } = session.metadata || {};
      if (app !== 'subscription' || !appId || !planId || !userId) {
        return reply.code(400).send({ error: 'Invalid session metadata' });
      }

      const uid = parseInt(userId);
      const aid = parseInt(appId);
      const pid = parseInt(planId);

      const plan = await Plan.objects.get({ id: pid }) as any;
      if (!plan) throw new Error(`Plan ${pid} not found`);

      let sub = await Subscription.objects.get({ userId: uid, appId: aid }) as any;
      if (sub) {
        sub.status = 'active';
        sub.planId = pid;
        // Simple logic for Demo: add credits
        sub.creditsRemaining = (sub.creditsRemaining || 0) + plan.monthlyCredits;
        sub.totalCreditsLimit = (sub.totalCreditsLimit || 0) + plan.monthlyCredits;
      } else {
        sub = new Subscription() as any;
        sub.userId = uid;
        sub.appId = aid;
        sub.planId = pid;
        sub.status = 'active';
        sub.creditsRemaining = plan.monthlyCredits;
        sub.totalCreditsLimit = plan.monthlyCredits;
      }

      const stripeSubId = session.subscription as string;
      sub.stripeSubscriptionId = stripeSubId;
      sub.stripeCustomerId = session.customer as string;

      if (stripeSubId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as any;
          sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
        } catch (e) {}
      }

      await sub.save();
      return reply.send({ success: true, subscription: sub });
    } catch (error: any) {
      console.error('[Verify Session Error]', error);
      reply.code(400).send({ error: error.message || 'Verification failed' });
    }
  });

  // --- Stripe Webhook (Matched to SEO Project style) ---
  fastify.post('/api/subscription/webhooks/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });

    const sig = request.headers['stripe-signature'];
    const endpointSecret = settings.stripe.webhookSecret;

    let event: Stripe.Event;
    try {
      // Use rawBody from fastify if available, otherwise fallback to request.body
      const payload = (request as any).rawBody || request.body;
      event = stripe.webhooks.constructEvent(payload, sig as string, endpointSecret as string);
    } catch (err: any) {
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};

        if (metadata.app === 'subscription') {
          const userId = parseInt(metadata.userId);
          const appId = parseInt(metadata.appId);
          const planId = parseInt(metadata.planId);

          const plan = await Plan.objects.get({ id: planId }) as any;
          if (!plan) throw new Error(`Plan ${planId} not found`);

          let sub = await Subscription.objects.get({ userId, appId }) as any;
          if (sub) {
            sub.status = 'active';
            sub.creditsRemaining = (sub.creditsRemaining || 0) + plan.monthlyCredits;
            sub.totalCreditsLimit = (sub.totalCreditsLimit || 0) + plan.monthlyCredits;
          } else {
            sub = new Subscription() as any;
            sub.userId = userId;
            sub.appId = appId;
            sub.planId = planId;
            sub.status = 'active';
            sub.creditsRemaining = plan.monthlyCredits;
            sub.totalCreditsLimit = plan.monthlyCredits;
            sub.createdAt = new Date().toISOString();
          }

          const stripeSubId = session.subscription as string;
          sub.stripeSubscriptionId = stripeSubId;
          sub.stripeCustomerId = session.customer as string;

          if (stripeSubId) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as any;
              sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
            } catch (e) {}
          }

          await sub.save();
          console.log(`[Stripe] App Subscription activated: User ${userId}, App ${appId}`);
        }
      }
      reply.send({ received: true });
    } catch (err: any) {
      console.error('[Stripe Webhook Error]', err);
      reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // Force-logout device (admin) - bypasses plan lock
  fastify.delete('/api/admin/devices/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await subscriptionService.forceLogoutDevice(parseInt(id));
    reply.send({ success: true });
  });

  // --- User Endpoints (requireAuth) ---

  // My Subscriptions
  fastify.get('/api/subscription/my', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const subscriptions = await Subscription.objects.filter<SubscriptionRecord>({ userId }).all();
    reply.send({ subscriptions });
  });

  // My Active Sessions
  fastify.get('/api/subscription/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const sessions = await DeviceSession.objects.filter<DeviceSessionRecord>({ userId }).orderBy('loginAt', 'DESC').all();

    // Enrich with app names
    const appIds = [...new Set(sessions.map((s: any) => s.appId))];
    const apps = await Promise.all(appIds.map((id) => App.objects.get<AppRecord>({ id })));
    const appMap = new Map(apps.filter(Boolean).map((a: any) => [a.id, a.name]));

    const enriched = sessions.map((s: any) => ({
      ...s,
      appName: appMap.get(s.appId) ?? '—',
    }));

    reply.send({ sessions: enriched });
  });

  // Logout specific session
  fastify.delete('/api/subscription/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const result = await subscriptionService.logoutSessionById(userId, parseInt(id));
    if (!result.success) {
      return reply.code(423).send({ success: false, error: result.error, lockedUntil: result.lockedUntil });
    }
    reply.send({ success: true });
  });

  // Public: List all active apps with their plans
  fastify.get('/api/subscription/apps', { preHandler: requireAuth }, async (request, reply) => {
    const apps = await App.objects.filter<AppRecord>({ isActive: true }).all();
    const result = await Promise.all(apps.map(async (app) => {
      const plans = await Plan.objects.filter<PlanRecord>({ appId: app.id!, isActive: true }).all();
      return { ...app, plans };
    }));
    reply.send({ apps: result });
  });

  // Subscribe to a plan (with Stripe Redirect)
  fastify.post('/api/subscription/subscribe', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const { appId, planId } = checkoutSchema.parse(request.body);
      const userId = request.user!.userId;
      const user = await User.objects.get<any>({ id: userId });
      if (!user) return reply.code(404).send({ error: 'User not found' });
      
      const plan = await Plan.objects.get<PlanRecord>({ id: planId });
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });

      // If free plan, subscribe immediately
      if (plan.isFree) {
        const subscription = await subscriptionService.subscribeToPlan(userId, appId, planId);
        return reply.send({ success: true, subscription });
      }

      // If paid plan, create Stripe checkout session
      const stripe = getStripe();
      if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: plan.stripePriceId as string, quantity: 1 }],
        mode: 'subscription',
        cancel_url: `${settings.frontendUrl}/dashboard/subscription/my?cancelled=true`,
        success_url: `${settings.frontendUrl}/dashboard/subscription/my?success=true&session_id={CHECKOUT_SESSION_ID}`,
        customer_email: request.user!.email,
        metadata: {
          userId: userId.toString(),
          appId: appId.toString(),
          planId: planId.toString(),
          app: 'subscription',
        },
      } as any);

      return reply.send({ success: true, stripeUrl: session.url });
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Subscription failed' });
    }
  });

  // --- Desktop App Endpoints (Special Auth) ---

  // Pre-Check (Check sub + quota WITHOUT login)
  fastify.post('/api/app/pre-check', async (request, reply) => {
    // We intentionally don't use requireAuth here because the desktop app
    // might be checking status before a standard Bearer token is available.
    const { email, password, appId, appSlug: bodySlug } = preCheckSchema.parse(request.body);
    const appSlug = (request.headers['x-app-slug'] as string) || bodySlug;

    const user = await User.objects.get<any>({ email });
    if (!user || !(await user.checkPassword(password))) {
      return reply.code(401).send({ success: false, error: 'Invalid credentials' });
    }

    let app;
    if (appId) {
      app = await App.objects.get<AppRecord>({ id: appId });
    } else if (appSlug) {
      app = await App.objects.get<AppRecord>({ slug: appSlug });
    }

    if (!app) return reply.code(404).send({ success: false, error: 'App not found' });

    const status = await subscriptionService.checkStatus(user.id, app.id!);
    reply.send(status);
  });

  // Desktop Login
  fastify.post('/api/app/login', async (request, reply) => {
    const { email, password, appId, appSlug: bodySlug, deviceId, deviceName, os, macAddress } = appLoginSchema.parse(request.body);

    const user = await User.objects.get<any>({ email });
    if (!user || !(await user.checkPassword(password))) {
      return reply.code(401).send({ success: false, error: 'Invalid credentials' });
    }

    // Check if app exists
    const appSlug = (request.headers['x-app-slug'] as string) || bodySlug;
    let app;
    if (appId) {
      app = await App.objects.get<AppRecord>({ id: appId });
    } else if (appSlug) {
      app = await App.objects.get<AppRecord>({ slug: appSlug });
    }

    if (!app) return reply.code(404).send({ success: false, error: 'App not found' });

    // Extract real IP
    const ipAddress = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || request.ip || null;

    const result = await subscriptionService.loginDevice(user.id, app.id!, deviceId, deviceName, { os, ipAddress, macAddress });
    if (!result.success) return reply.code(403).send(result);

    const subscription = await subscriptionService.getUserSubscription(user.id, app.id!);
    const plan = subscription ? await Plan.objects.get<PlanRecord>({ id: subscription.planId }) : null;

    reply.send({
      success: true,
      appToken: result.appToken,
      status: subscription?.status || 'no_subscription',
      creditsRemaining: subscription?.creditsRemaining || 0,
      totalCreditsUsed: subscription?.totalCreditsUsed || 0,
      planName: plan?.name || 'None',
      lockedUntilAt: result.lockedUntilAt,
    });
  });

  // Status Check
  fastify.get('/api/app/status', async (request, reply) => {
    const appToken = request.headers['authorization']?.replace('Bearer ', '');
    if (!appToken) return reply.code(401).send({ error: 'Unauthorized' });

    const session = await subscriptionService.validateSession(appToken);
    if (!session) return reply.code(401).send({ loggedIn: false, error: 'Session expired or invalid' });

    const subscription = await subscriptionService.getUserSubscription(session.userId, session.appId);
    const now = new Date();
    const isLocked = !!(session.lockedUntilAt && now < new Date(session.lockedUntilAt));

    reply.send({
      loggedIn: true,
      creditsRemaining: subscription?.creditsRemaining || 0,
      totalCreditsUsed: subscription?.totalCreditsUsed || 0,
      creditFinished: (subscription?.creditsRemaining || 0) <= 0,
      sessionExpired: false,
      lockedUntilAt: session.lockedUntilAt,
      canLogout: !isLocked,
    });
  });

  // Use Credit
  fastify.post('/api/app/use-credit', async (request, reply) => {
    const { appToken, taskName } = useCreditSchema.parse(request.body);
    const session = await subscriptionService.validateSession(appToken);
    if (!session) return reply.code(401).send({ success: false, error: 'Session expired or invalid' });

    // taskName is taken but no longer logged per user requirement
    const result = await subscriptionService.useCredit(session.userId, session.appId, taskName, session.deviceId);
    if (!result.success) return reply.code(403).send(result);

    reply.send(result);
  });

  // Logout
  fastify.post('/api/app/logout', async (request, reply) => {
    const appToken = request.headers['authorization']?.replace('Bearer ', '');
    if (!appToken) return reply.send({ success: true });
    const result = await subscriptionService.logoutDevice(appToken);
    if (!result.success) {
      return reply.code(423).send({ success: false, error: result.error, lockedUntil: result.lockedUntil });
    }
    reply.send({ success: true });
  });
}
