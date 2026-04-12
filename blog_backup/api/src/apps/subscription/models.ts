import { Model } from '../../core/model';
import { CharField, BooleanField, DateTimeField, TextField, IntegerField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

// ─── App ─────────────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'Subscription',
  displayName: 'Apps',
  icon: 'layout',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'slug', 'isActive', 'createdAt'],
  searchFields: ['name', 'slug'],
  filterFields: ['isActive'],
})
export class App extends Model {
  name = new CharField({ maxLength: 200 });
  slug = new CharField({ unique: true, maxLength: 100 });
  description = new TextField({ nullable: true });
  isActive = new BooleanField({ default: true });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'sub_apps'; }
}

// ─── Plan ─────────────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'Subscription',
  displayName: 'Plans',
  icon: 'credit-card',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'appId', 'name', 'isFree', 'monthlyCredits', 'priceUsdCents', 'isActive'],
  searchFields: ['name'],
  filterFields: ['isFree', 'isActive'],
})
export class Plan extends Model {
  appId = new ForeignKey('App', { relatedTable: 'sub_apps' });
  name = new CharField({ maxLength: 200 });
  isFree = new BooleanField({ default: false });
  monthlyCredits = new IntegerField({ default: 0 });
  priceUsdCents = new IntegerField({ default: 0 });
  stripePriceId = new CharField({ maxLength: 255, nullable: true });
  maxConcurrentDevices = new IntegerField({ default: 1 });   // how many devices can be active at once
  allowMultiDevice = new BooleanField({ default: false });   // allow >1 device session
  deviceLockMinutes = new IntegerField({ nullable: true });  // min session duration before logout allowed; null = no lock
  featuresJson = new TextField({ nullable: true, default: '["Feature 1", "Feature 2"]' }); // JSON array of features
  isActive = new BooleanField({ default: true });

  static getTableName(): string { return 'sub_plans'; }
}

// ─── Subscription ─────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'Subscription',
  displayName: 'Subscriptions',
  icon: 'users',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'userId', 'appId', 'planId', 'status', 'creditsRemaining'],
  searchFields: [],
  filterFields: ['status'],
  relatedFields: {
    userId: 'User',
  },
})
export class Subscription extends Model {
  userId = new IntegerField();
  appId = new ForeignKey('App', { relatedTable: 'sub_apps' });
  planId = new ForeignKey('Plan', { relatedTable: 'sub_plans' });
  status = new CharField({ maxLength: 50, default: 'active' }); // active|expired|cancelled|trialing
  creditsRemaining = new IntegerField({ default: 0 });
  totalCreditsLimit = new IntegerField({ default: 0 });
  totalCreditsUsed = new IntegerField({ default: 0 });
  lastCreditUsedAt = new DateTimeField({ nullable: true }); // updated on every credit deduction
  creditsGrantedAt = new DateTimeField({ nullable: true });
  stripeSubscriptionId = new CharField({ maxLength: 255, nullable: true });
  stripeCustomerId = new CharField({ maxLength: 255, nullable: true });
  currentPeriodEnd = new DateTimeField({ nullable: true });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });
  updatedAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'sub_subscriptions'; }
}



// ─── DeviceSession ────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'Subscription',
  displayName: 'Device Sessions',
  icon: 'monitor',
  permissions: ['view', 'delete'],
  listDisplay: ['id', 'userId', 'appId', 'deviceId', 'deviceName', 'loginAt', 'lastSeenAt'],
  searchFields: ['deviceId', 'deviceName'],
  filterFields: [],
  excludeFields: ['appToken'],
  relatedFields: {
    userId: 'User',
    appId: 'App',
  },
})
export class DeviceSession extends Model {
  userId = new IntegerField();
  appId = new IntegerField();
  deviceId = new CharField({ maxLength: 255 });
  deviceName = new CharField({ maxLength: 255, nullable: true });
  appToken = new CharField({ unique: true, maxLength: 500 }); // hashed, excluded from admin display
  os = new CharField({ maxLength: 255, nullable: true });
  ipAddress = new CharField({ maxLength: 100, nullable: true });
  macAddress = new CharField({ maxLength: 100, nullable: true });
  loginAt = new DateTimeField({ default: () => new Date().toISOString() });
  lastSeenAt = new DateTimeField({ default: () => new Date().toISOString() });
  loggedOutAt = new DateTimeField({ nullable: true });
  lockedUntilAt = new DateTimeField({ nullable: true }); // computed from plan at login time; logout blocked until this time

  static getTableName(): string { return 'sub_device_sessions'; }
}

// ─── TypeScript Record Types ───────────────────────────────────────────────────
export type AppRecord = Omit<App, 'name'|'slug'|'description'|'isActive'|'createdAt'> & {
  name: string; slug: string; description: string|null; isActive: boolean; createdAt: string;
};

export type PlanRecord = Omit<Plan, 'appId'|'name'|'isFree'|'monthlyCredits'|'priceUsdCents'|'stripePriceId'|'maxConcurrentDevices'|'allowMultiDevice'|'deviceLockMinutes'|'isActive'> & {
  appId: number; name: string; isFree: boolean; monthlyCredits: number;
  priceUsdCents: number; stripePriceId: string|null;
  maxConcurrentDevices: number; allowMultiDevice: boolean; deviceLockMinutes: number|null;
  isActive: boolean;
  featuresJson: string|null;
};

export type SubscriptionRecord = Omit<Subscription,
  'userId'|'appId'|'planId'|'status'|'creditsRemaining'|'totalCreditsUsed'|'lastCreditUsedAt'|'creditsGrantedAt'|
  'stripeSubscriptionId'|'stripeCustomerId'|'currentPeriodEnd'|'createdAt'|'updatedAt'> & {
  userId: number; appId: number; planId: number; status: string;
  creditsRemaining: number; totalCreditsLimit: number; totalCreditsUsed: number; lastCreditUsedAt: string|null;
  creditsGrantedAt: string|null; stripeSubscriptionId: string|null;
  stripeCustomerId: string|null; currentPeriodEnd: string|null; createdAt: string; updatedAt: string;
};

export type DeviceSessionRecord = Omit<DeviceSession,
  'userId'|'appId'|'deviceId'|'deviceName'|'appToken'|'os'|'ipAddress'|'macAddress'|
  'loginAt'|'lastSeenAt'|'loggedOutAt'|'lockedUntilAt'> & {
  userId: number; appId: number; deviceId: string; deviceName: string|null;
  appToken: string; os: string|null; ipAddress: string|null; macAddress: string|null;
  loginAt: string; lastSeenAt: string;
  loggedOutAt: string|null; lockedUntilAt: string|null;
};
