import { Model } from '../../core/model';
import { CharField, BooleanField, DateTimeField, TextField, IntegerField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

// ─── SeoProject ──────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Projects',
  icon: 'search',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'websiteUrl', 'paymentStatus', 'status', 'estimatedDeliveryDate', 'createdAt'],
  searchFields: ['websiteUrl'],
  filterFields: ['status', 'paymentStatus'],
  excludeFields: ['createdByAdminId'],
  relatedFields: {
    assignedUserId: 'User',
    createdByAdminId: 'User',
    selectedPlanId: 'SeoPlan',
    seoSubscriptionId: 'SeoSubscription',
  },
})
export class SeoProject extends Model {
  websiteUrl = new CharField({ maxLength: 255 });
  searchConsoleUrl = new CharField({ maxLength: 255, nullable: true });
  bingUrl = new CharField({ maxLength: 255, nullable: true });
  gmbUrl = new CharField({ maxLength: 255, nullable: true });
  otherTrafficUrl = new CharField({ maxLength: 255, nullable: true });
  keywordSheetUrl = new CharField({ maxLength: 255, nullable: true });
  draftSheetUrl = new CharField({ maxLength: 255, nullable: true });
  otherSourceUrl = new CharField({ maxLength: 255, nullable: true });
  competitorsUrl = new CharField({ maxLength: 255, nullable: true });
  
  // Client Contact (Admin Only visibility in frontend)
  clientName = new CharField({ maxLength: 255, nullable: true });
  clientEmail = new CharField({ maxLength: 255, nullable: true });
  clientWhatsapp = new CharField({ maxLength: 255, nullable: true });
  clientContact = new CharField({ maxLength: 255, nullable: true });
  notes = new TextField({ nullable: true });

  // Billing / onboarding state
  paymentStatus = new CharField({ maxLength: 50, default: 'pending' }); // pending | paid
  billingType = new CharField({ maxLength: 20, default: 'onetime' }); // onetime | monthly
  priceUsdCents = new IntegerField({ default: 0 });
  selectedPlanId = new IntegerField({ nullable: true });
  selectedPlanName = new CharField({ maxLength: 255, nullable: true });
  paymentLinkToken = new CharField({ maxLength: 255, nullable: true });
  paymentLinkUrl = new CharField({ maxLength: 500, nullable: true });
  setupPasswordToken = new CharField({ maxLength: 255, nullable: true });
  setupPasswordSentAt = new DateTimeField({ nullable: true });
  setupPasswordGeneratedAt = new DateTimeField({ nullable: true });
  paidAt = new DateTimeField({ nullable: true });
  stripeCheckoutSessionId = new CharField({ maxLength: 255, nullable: true });
  stripeSubscriptionId = new CharField({ maxLength: 255, nullable: true });
  stripePaymentIntentId = new CharField({ maxLength: 255, nullable: true });
  
  // Website CMS credentials (client fills after purchase, password encrypted)
  websiteAdminUrl      = new CharField({ maxLength: 255, nullable: true });
  websiteAdminUsername = new CharField({ maxLength: 255, nullable: true });
  websiteAdminPassword = new TextField({ nullable: true }); // AES-256 encrypted

  // Hosting / cPanel credentials (optional, password encrypted)
  panelLoginUrl      = new CharField({ maxLength: 255, nullable: true });
  panelUsername      = new CharField({ maxLength: 255, nullable: true });
  panelPassword      = new TextField({ nullable: true }); // AES-256 encrypted

  assignedUserId    = new IntegerField({ nullable: true }); // Client account
  createdByAdminId  = new IntegerField();
  seoSubscriptionId = new IntegerField({ nullable: true }); // FK to SeoSubscription
  customOfferId     = new IntegerField({ nullable: true }); // Originating offer
  stripeOrderId     = new CharField({ maxLength: 255, nullable: true });
  status = new CharField({ maxLength: 50, default: 'pending' }); // pending | active | paused | completed | pending_info
  estimatedDeliveryDate = new DateTimeField({ nullable: true });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_projects'; }
  
  async delete(): Promise<void> {
    if (!this.id) return;
    
    const projectId = this.id;

    // Manual Cascade Delete for related SEO records
    // These classes are defined in this file, so they are available in the module scope
    await SiteStatusRecord.objects.filter({ seoProjectId: projectId }).delete();
    await OnPageRecord.objects.filter({ seoProjectId: projectId }).delete();
    await TopicalMapTopic.objects.filter({ seoProjectId: projectId }).delete();
    await TopicalMapRecord.objects.filter({ seoProjectId: projectId }).delete();
    await SeoProjectAssignment.objects.filter({ seoProjectId: projectId }).delete();
    await OffPageRecord.objects.filter({ seoProjectId: projectId }).delete();
    await GmbActivityRecord.objects.filter({ seoProjectId: projectId }).delete();
    await SeoProgressRecord.objects.filter({ seoProjectId: projectId }).delete();
    
    // Unlink subscription if it exists
    const subs = await SeoSubscription.objects.filter<any>({ seoProjectId: projectId }).all();
    for (const sub of subs) {
      sub.seoProjectId = null;
      await sub.save();
    }

    await super.delete();
  }
}

// ─── SiteStatusRecord (Type 1) ───────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Site Status Records',
  icon: 'bar-chart-2',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'scTraffic', 'siteAge'],
  searchFields: ['url'],
  filterFields: [],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User',
  },
})
export class SiteStatusRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField();
  url = new CharField({ maxLength: 255 });
  scTraffic = new IntegerField({ default: 0 });
  bingTraffic = new IntegerField({ default: 0 });
  gmbTraffic = new IntegerField({ default: 0 });
  otherTraffic = new IntegerField({ default: 0 });
  siteAge = new CharField({ maxLength: 100 });
  mobileSpeed = new IntegerField({ nullable: true });
  desktopSpeed = new IntegerField({ nullable: true });
  monthlyTargetNote = new TextField({ nullable: true });
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_site_status'; }
}

// ─── OnPageRecord (Type 2) ───────────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'On-Page Records',
  icon: 'edit-3',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'keywordPicked', 'taskStatus'],
  searchFields: ['url', 'keywordPicked'],
  filterFields: ['taskStatus'],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User',
  },
})
export class OnPageRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField();
  url = new CharField({ maxLength: 255 });
  traffic = new IntegerField({ default: 0 });
  keywordPicked = new CharField({ maxLength: 255 });
  wordCount = new IntegerField({ default: 0 });
  mobileSpeed = new IntegerField({ nullable: true });
  desktopSpeed = new IntegerField({ nullable: true });
  taskStatus = new CharField({ maxLength: 50 }); // create_content | update_content | fix_technical
  workedDetails = new TextField({ nullable: true });
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_on_page'; }
}

// ─── TopicalMapTopic (Dropdown Items) ────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Topical Map Topics',
  icon: 'tag',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'mainTopicName', 'createdAt'],
  searchFields: ['mainTopicName'],
  filterFields: [],
  relatedFields: {
    seoProjectId: 'SeoProject',
  },
})
export class TopicalMapTopic extends Model {
  seoProjectId = new IntegerField();
  mainTopicName = new CharField({ maxLength: 255 });
  mainTopicUrl = new CharField({ maxLength: 500, nullable: true });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_topical_topics'; }
}

// ─── TopicalMapRecord (Type 3) ───────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Topical Map Records',
  icon: 'map',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'subTopicName', 'url'],
  searchFields: ['subTopicName', 'url'],
  filterFields: [],
  relatedFields: {
    seoProjectId: 'SeoProject',
    mainTopicId: 'TopicalMapTopic',
    createdById: 'User',
  },
})
export class TopicalMapRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField();
  mainTopicId = new IntegerField(); // FK to TopicalMapTopic
  subTopicName = new CharField({ maxLength: 255 });
  url = new CharField({ maxLength: 255 });
  searchVolume = new IntegerField({ default: 0 });
  wordCount = new IntegerField({ default: 0 });
  providedLinkUrl = new CharField({ maxLength: 255, nullable: true });
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_topical_map'; }
}

// ─── SeoProjectAssignment (Many-to-many: project ↔ users) ───────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Project Assignments',
  icon: 'users',
  listDisplay: ['id', 'seoProjectId', 'userId', 'createdAt'],
  searchFields: [],
  filterFields: [],
  relatedFields: {
    seoProjectId: 'SeoProject',
    userId: 'User',
  },
})
export class SeoProjectAssignment extends Model {
  seoProjectId = new IntegerField();
  userId = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_project_assignments'; }
}

// ─── OffPageRecord (Type 4) ──────────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Off-Page Records',
  icon: 'link',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'backlinkType', 'anchorText'],
  searchFields: ['sourceUrl', 'anchorText', 'receivedLinkUrl'],
  filterFields: ['backlinkType'],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User',
  },
})
export class OffPageRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField();
  backlinkType = new CharField({ maxLength: 50 }); // guest_post|directory|forum|social|comment|other
  platformUrl = new CharField({ maxLength: 255, nullable: true }); // e.g. blogger.com
  sourceUrl = new CharField({ maxLength: 255 });
  anchorText = new CharField({ maxLength: 255 });
  receivedLinkUrl = new CharField({ maxLength: 255 });
  wordCount = new IntegerField({ default: 0 });
  username = new CharField({ maxLength: 255, nullable: true });
  email = new CharField({ maxLength: 255, nullable: true });
  password = new TextField({ nullable: true }); // AES-256 Encrypted
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_off_page'; }
}

// ─── GmbActivityRecord (Type 5) ─────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'GMB Activity Records',
  icon: 'map-pin',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'taskType', 'taskName', 'status'],
  searchFields: ['taskName', 'url', 'details'],
  filterFields: ['taskType', 'status'],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User',
  },
})
export class GmbActivityRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField();
  taskType = new CharField({ maxLength: 50 }); // profile | post | review | media | audit | qna | other
  taskName = new CharField({ maxLength: 255 });
  url = new CharField({ maxLength: 500, nullable: true });
  details = new TextField({ nullable: true });
  status = new CharField({ maxLength: 50, default: 'done' }); // done | scheduled | in_progress
  proofUrl = new CharField({ maxLength: 500, nullable: true });
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_gmb_activities'; }
}

// ─── SeoPlan ─────────────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'SEO Plans',
  icon: 'credit-card',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'billingType', 'priceUsdCents', 'deliveryDays', 'isActive', 'createdAt'],
  searchFields: ['name'],
  filterFields: ['billingType', 'isActive'],
})
export class SeoPlan extends Model {
  name            = new CharField({ maxLength: 200 });
  description     = new TextField({ nullable: true });
  priceUsdCents   = new IntegerField({ default: 0 }); // 0 = free
  deliveryDays    = new IntegerField({ default: 0 });
  billingType     = new CharField({ maxLength: 20, default: 'onetime' }); // monthly | onetime | free
  stripeProductId = new CharField({ maxLength: 255, nullable: true });
  stripePriceId   = new CharField({ maxLength: 255, nullable: true });
  isActive        = new BooleanField({ default: true });
  featuresJson    = new TextField({ nullable: true, default: '["SEO Audit", "Weekly Reports"]' }); // JSON array of features
  createdAt       = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_plans'; }
}

// ─── SeoProgressRecord (Working Progress Records) ───────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'Progress Records',
  icon: 'activity',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'seoProjectId', 'recordDate', 'taskName', 'status'],
  searchFields: ['taskName', 'details'],
  relatedFields: {
    seoProjectId: 'SeoProject',
    createdById: 'User',
  },
})
export class SeoProgressRecord extends Model {
  seoProjectId = new IntegerField();
  recordDate = new DateTimeField({ default: () => new Date().toISOString() });
  taskName = new CharField({ maxLength: 255 });
  taskUrl = new CharField({ maxLength: 500, nullable: true });
  details = new TextField({ nullable: true });
  status = new CharField({ maxLength: 50, default: 'done' }); // done | in_progress
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_progress_records'; }
}

// ─── SeoSubscription ─────────────────────────────────────────────────────────
@registerAdmin({
  appName: 'SEO',
  displayName: 'SEO Subscriptions',
  icon: 'users',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'userId', 'planId', 'status', 'currentPeriodEnd', 'createdAt'],
  searchFields: [],
  filterFields: ['status'],
  relatedFields: {
    userId: 'User',
    seoProjectId: 'SeoProject',
  },
})
export class SeoSubscription extends Model {
  userId                = new IntegerField();
  planId                = new ForeignKey('SeoPlan', { relatedTable: 'seo_plans', nullable: true });
  seoProjectId          = new IntegerField({ nullable: true });
  status                = new CharField({ maxLength: 50, default: 'active' }); // active | cancelled | expired
  stripeSubscriptionId  = new CharField({ maxLength: 255, nullable: true });
  stripePaymentIntentId = new CharField({ maxLength: 255, nullable: true });
  currentPeriodEnd      = new DateTimeField({ nullable: true });
  createdAt             = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'seo_subscriptions'; }
}

// ─── Record Types ─────────────────────────────────────────────────────────────
export type SeoPlanRecord = Omit<SeoPlan,
  'name'|'description'|'priceUsdCents'|'billingType'|'stripeProductId'|'stripePriceId'|'isActive'|'createdAt'> & {
  name: string; description: string|null; priceUsdCents: number; billingType: string;
  stripeProductId: string|null; stripePriceId: string|null; isActive: boolean; 
  featuresJson: string|null; createdAt: string;
};

export type SeoSubscriptionRecord = Omit<SeoSubscription,
  'userId'|'planId'|'seoProjectId'|'status'|'stripeSubscriptionId'|'stripePaymentIntentId'|'currentPeriodEnd'|'createdAt'> & {
  userId: number; planId: number; seoProjectId: number|null; status: string;
  stripeSubscriptionId: string|null; stripePaymentIntentId: string|null;
  currentPeriodEnd: string|null; createdAt: string;
};

export type GmbActivityRecordType = Omit<GmbActivityRecord,
  'seoProjectId'|'recordDate'|'taskType'|'taskName'|'url'|'details'|'status'|'proofUrl'|'createdById'|'createdAt'> & {
  seoProjectId: number; recordDate: string; taskType: string; taskName: string;
  url: string|null; details: string|null; status: string; proofUrl: string|null;
  createdById: number; createdAt: string;
};

export type SeoProgressRecordType = Omit<SeoProgressRecord,
  'seoProjectId'|'recordDate'|'taskName'|'taskUrl'|'details'|'status'|'createdById'|'createdAt'> & {
  seoProjectId: number; recordDate: string; taskName: string;
  taskUrl: string|null; details: string|null; status: string;
  createdById: number; createdAt: string;
  createdByUsername?: string;
};
