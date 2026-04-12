import Fastify, { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import authService from '../../../apps/auth/service';
import { RefreshToken, User } from '../../../apps/auth/models';
import subscriptionRoutes from '../../../apps/subscription/routes';
import {
  App,
  DeviceSession,
  Plan,
  Subscription,
} from '../../../apps/subscription/models';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(subscriptionRoutes);
  await app.ready();
  return app;
}

async function createActiveUser(email: string, password: string) {
  const user = new User() as any;
  user.username = email.split('@')[0];
  user.email = email;
  user.firstName = 'Test';
  user.lastName = 'User';
  user.isActive = true;
  user.isStaff = false;
  user.isSuperuser = false;
  await user.setPassword(password);
  await user.save();
  return user;
}

async function createAppWithPlan(monthlyCredits: number, slug: string) {
  const app = await App.objects.create<any>({
    name: 'Desktop Spider',
    slug,
    description: 'Subscription test app',
    isActive: true,
  });

  const plan = await Plan.objects.create<any>({
    appId: app.id,
    name: 'Starter',
    isFree: true,
    monthlyCredits,
    priceUsdCents: 0,
    isActive: true,
  });

  return { app, plan };
}

beforeAll(async () => {
  await User.createTable();
  await RefreshToken.createTable();
  await App.createTable();
  await Plan.createTable();
  await Subscription.createTable();
  await DeviceSession.createTable();
});

beforeEach(async () => {
  await DeviceSession.objects.all().delete();
  await Subscription.objects.all().delete();
  await Plan.objects.all().delete();
  await App.objects.all().delete();
  await RefreshToken.objects.all().delete();
  await User.objects.all().delete();
});

describe('subscription routes', () => {
  let testApp: FastifyInstance;

  afterEach(async () => {
    if (testApp) {
      await testApp.close();
    }
  });

  it('subscribes an authenticated user and returns the subscription in my subscriptions', async () => {
    testApp = await buildApp();

    const password = 'password123';
    const user = await createActiveUser('subscriber@example.com', password);
    const accessToken = authService.generateAccessToken(user);
    const { app, plan } = await createAppWithPlan(3, 'desktop-spider-subscribe');

    const subscribeResponse = await testApp.inject({
      method: 'POST',
      url: '/api/subscription/subscribe',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        appId: app.id,
        planId: plan.id,
      },
    });

    expect(subscribeResponse.statusCode).toBe(200);
    const subscribeBody = subscribeResponse.json();
    expect(subscribeBody.success).toBe(true);
    expect(subscribeBody.subscription.planId).toBe(plan.id);
    expect(subscribeBody.subscription.creditsRemaining).toBe(3);

    const mySubscriptionsResponse = await testApp.inject({
      method: 'GET',
      url: '/api/subscription/my',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(mySubscriptionsResponse.statusCode).toBe(200);
    const mySubscriptionsBody = mySubscriptionsResponse.json();
    expect(mySubscriptionsBody.subscriptions).toHaveLength(1);
    expect(mySubscriptionsBody.subscriptions[0].appId).toBe(app.id);
    expect(mySubscriptionsBody.subscriptions[0].creditsRemaining).toBe(3);

    const appsResponse = await testApp.inject({
      method: 'GET',
      url: '/api/subscription/apps',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(appsResponse.statusCode).toBe(200);
    const appsBody = appsResponse.json();
    expect(appsBody.apps).toHaveLength(1);
    expect(appsBody.apps[0].plans).toHaveLength(1);
    expect(appsBody.apps[0].plans[0].monthlyCredits).toBe(3);
  });

  it('supports desktop login, credit usage, status checks, and credit log retrieval', async () => {
    testApp = await buildApp();

    const password = 'password123';
    const email = 'credits@example.com';
    const user = await createActiveUser(email, password);
    const accessToken = authService.generateAccessToken(user);
    const { app, plan } = await createAppWithPlan(2, 'desktop-spider-credits');

    await testApp.inject({
      method: 'POST',
      url: '/api/subscription/subscribe',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        appId: app.id,
        planId: plan.id,
      },
    });

    const loginResponse = await testApp.inject({
      method: 'POST',
      url: '/api/app/login',
      headers: {
        'x-app-slug': app.slug,
      },
      payload: {
        email,
        password,
        deviceId: 'device-001',
        deviceName: 'Windows Laptop',
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.planName).toBe('Starter');
    expect(loginBody.creditsRemaining).toBe(2);
    expect(loginBody.appToken).toBeTruthy();

    const firstStatus = await testApp.inject({
      method: 'GET',
      url: '/api/app/status',
      headers: {
        authorization: `Bearer ${loginBody.appToken}`,
      },
    });

    expect(firstStatus.statusCode).toBe(200);
    expect(firstStatus.json()).toMatchObject({
      loggedIn: true,
      creditsRemaining: 2,
      creditFinished: false,
      sessionExpired: false,
    });

    const firstUse = await testApp.inject({
      method: 'POST',
      url: '/api/app/use-credit',
      payload: {
        appToken: loginBody.appToken,
        taskName: 'crawl-homepage',
      },
    });

    expect(firstUse.statusCode).toBe(200);
    expect(firstUse.json()).toMatchObject({
      success: true,
      creditsRemaining: 1,
    });

    const secondUse = await testApp.inject({
      method: 'POST',
      url: '/api/app/use-credit',
      payload: {
        appToken: loginBody.appToken,
        taskName: 'crawl-category-page',
      },
    });

    expect(secondUse.statusCode).toBe(200);
    expect(secondUse.json()).toMatchObject({
      success: true,
      creditsRemaining: 0,
    });

    const finalStatus = await testApp.inject({
      method: 'GET',
      url: '/api/app/status',
      headers: {
        authorization: `Bearer ${loginBody.appToken}`,
      },
    });

    expect(finalStatus.statusCode).toBe(200);
    expect(finalStatus.json()).toMatchObject({
      loggedIn: true,
      creditsRemaining: 0,
      creditFinished: true,
      sessionExpired: false,
    });

    const exhaustedUse = await testApp.inject({
      method: 'POST',
      url: '/api/app/use-credit',
      payload: {
        appToken: loginBody.appToken,
        taskName: 'crawl-blog-page',
      },
    });

    expect(exhaustedUse.statusCode).toBe(403);
    expect(exhaustedUse.json()).toMatchObject({
      success: false,
      error: 'Insufficient credits',
    });

    const mySubscriptionsResponse = await testApp.inject({
      method: 'GET',
      url: '/api/subscription/my',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(mySubscriptionsResponse.statusCode).toBe(200);
    const mySubscriptionsBody = mySubscriptionsResponse.json();
    expect(mySubscriptionsBody.subscriptions).toHaveLength(1);
    expect(mySubscriptionsBody.subscriptions[0]).toMatchObject({
      appId: app.id,
      planId: plan.id,
      creditsRemaining: 0,
      totalCreditsUsed: 2,
    });
    expect(mySubscriptionsBody.subscriptions[0].creditsGrantedAt).toBeTruthy();
    expect(mySubscriptionsBody.subscriptions[0].lastCreditUsedAt).toBeTruthy();
  });

  it('blocks a second device when the app policy disallows multi-device sessions', async () => {
    testApp = await buildApp();

    const password = 'password123';
    const email = 'policy@example.com';
    const user = await createActiveUser(email, password);
    const accessToken = authService.generateAccessToken(user);
    const { app, plan } = await createAppWithPlan(5, 'desktop-spider-policy');

    plan.maxConcurrentDevices = 1;
    plan.allowMultiDevice = false;
    await plan.save();

    await testApp.inject({
      method: 'POST',
      url: '/api/subscription/subscribe',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        appId: app.id,
        planId: plan.id,
      },
    });

    const firstLogin = await testApp.inject({
      method: 'POST',
      url: '/api/app/login',
      headers: {
        'x-app-slug': app.slug,
      },
      payload: {
        email,
        password,
        deviceId: 'device-001',
        deviceName: 'Primary Laptop',
      },
    });

    expect(firstLogin.statusCode).toBe(200);

    const secondLogin = await testApp.inject({
      method: 'POST',
      url: '/api/app/login',
      headers: {
        'x-app-slug': app.slug,
      },
      payload: {
        email,
        password,
        deviceId: 'device-002',
        deviceName: 'Backup Laptop',
      },
    });

    expect(secondLogin.statusCode).toBe(403);
    expect(secondLogin.json()).toMatchObject({
      success: false,
      error: 'Maximum concurrent devices reached. Please logout from another device.',
    });
  });
});
