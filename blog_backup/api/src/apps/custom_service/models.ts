import { Model } from '../../core/model';
import { CharField, BooleanField, DateTimeField, TextField, IntegerField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

// ─── CustomServiceProject ───────────────────────────────────────────────────
@registerAdmin({
  appName: 'Custom Services',
  displayName: 'Projects',
  icon: 'layers',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'projectName', 'clientName', 'paymentStatus', 'status', 'estimatedDeliveryDate'],
  searchFields: ['projectName', 'clientName', 'clientEmail'],
  filterFields: ['status', 'paymentStatus'],
  relatedFields: {
    assignedUserId: 'User',
    createdByAdminId: 'User',
    selectedPlanId: 'CustomServicePlan',
  },
})
export class CustomServiceProject extends Model {
  projectName = new CharField({ maxLength: 255 });
  clientName = new CharField({ maxLength: 255 });
  clientEmail = new CharField({ maxLength: 255 });
  clientWhatsapp = new CharField({ maxLength: 50, nullable: true });
  clientContact = new CharField({ maxLength: 255, nullable: true });
  googleDriveUrl = new CharField({ maxLength: 500, nullable: true });
  trelloUrl = new CharField({ maxLength: 500, nullable: true });
  sheetUrl = new CharField({ maxLength: 500, nullable: true });
  notes = new TextField({ nullable: true });

  // Status & Billing
  status = new CharField({ maxLength: 50, default: 'pending' }); // pending | active | completed
  paymentStatus = new CharField({ maxLength: 50, default: 'pending' }); // pending | paid
  priceUsdCents = new IntegerField({ default: 0 });
  selectedPlanId = new IntegerField({ nullable: true });
  selectedPlanName = new CharField({ maxLength: 255, nullable: true });
  
  // Dates
  estimatedDeliveryDate = new DateTimeField({ nullable: true });
  paidAt = new DateTimeField({ nullable: true });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  // Tokens & Stripe
  paymentLinkToken = new CharField({ maxLength: 255, nullable: true });
  paymentLinkUrl = new CharField({ maxLength: 500, nullable: true });
  setupPasswordSentAt = new DateTimeField({ nullable: true });
  stripeCheckoutSessionId = new CharField({ maxLength: 255, nullable: true });
  stripePaymentIntentId = new CharField({ maxLength: 255, nullable: true });

  assignedUserId    = new IntegerField({ nullable: true }); // Client account
  createdByAdminId  = new IntegerField();
  customOfferId     = new IntegerField({ nullable: true });

  static getTableName(): string { return 'custom_projects'; }

  async delete(): Promise<void> {
    if (!this.id) return;
    const projectId = this.id;
    await CustomServiceProgress.objects.filter({ projectId }).delete();
    await CustomServiceAssignment.objects.filter({ projectId }).delete();
    await CustomServiceDateExtension.objects.filter({ projectId }).delete();
    await super.delete();
  }
}

// ─── CustomServiceProgress (Working Progress Records) ───────────────────────
@registerAdmin({
  appName: 'Custom Services',
  displayName: 'Progress Records',
  icon: 'activity',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'projectId', 'recordDate', 'taskName', 'status'],
  searchFields: ['taskName', 'details'],
  relatedFields: {
    projectId: 'CustomServiceProject',
    createdById: 'User',
  },
})
export class CustomServiceProgress extends Model {
  projectId = new IntegerField();
  recordDate = new DateTimeField({ default: () => new Date().toISOString() });
  taskName = new CharField({ maxLength: 255 });
  taskUrl = new CharField({ maxLength: 500, nullable: true });
  details = new TextField({ nullable: true });
  status = new CharField({ maxLength: 50, default: 'done' }); // done | in_progress
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'custom_progress_records'; }
}

// ─── CustomServicePlan ───────────────────────────────────────────────────────
@registerAdmin({
  appName: 'Custom Services',
  displayName: 'Plans',
  icon: 'package',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'priceUsdCents', 'deliveryDays', 'isActive'],
  searchFields: ['name'],
})
export class CustomServicePlan extends Model {
  name = new CharField({ maxLength: 200 });
  description = new TextField({ nullable: true });
  priceUsdCents = new IntegerField({ default: 0 });
  deliveryDays = new IntegerField({ default: 0 });
  billingType = new CharField({ maxLength: 20, default: 'onetime' });
  stripeProductId = new CharField({ maxLength: 255, nullable: true });
  stripePriceId = new CharField({ maxLength: 255, nullable: true });
  isActive = new BooleanField({ default: true });
  featuresJson = new TextField({ nullable: true, default: '["One-time payment", "Dedicated Support", "Real-time Progress Tracking"]' });
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'custom_service_plans'; }
}

// ─── CustomServiceAssignment ─────────────────────────────────────────────────
@registerAdmin({
  appName: 'Custom Services',
  displayName: 'Staff Assignments',
  icon: 'users',
  listDisplay: ['id', 'projectId', 'userId', 'createdAt'],
  relatedFields: {
    projectId: 'CustomServiceProject',
    userId: 'User',
  },
})
export class CustomServiceAssignment extends Model {
  projectId = new IntegerField();
  userId = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'custom_project_assignments'; }
}

// ─── CustomServiceDateExtension ──────────────────────────────────────────────
@registerAdmin({
  appName: 'Custom Services',
  displayName: 'Date Extensions',
  icon: 'calendar',
  listDisplay: ['id', 'projectId', 'previousDate', 'newDate', 'createdAt'],
  relatedFields: {
    projectId: 'CustomServiceProject',
    createdById: 'User',
  },
})
export class CustomServiceDateExtension extends Model {
  projectId = new IntegerField();
  previousDate = new DateTimeField({ nullable: true });
  newDate = new DateTimeField();
  note = new TextField();
  createdById = new IntegerField();
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });

  static getTableName(): string { return 'custom_project_date_extensions'; }
}

// ─── Record Types ─────────────────────────────────────────────────────────────
export type CustomServiceProjectRecord = Omit<CustomServiceProject, 
  'projectName'|'clientName'|'clientEmail'|'clientWhatsapp'|'clientContact'|'notes'|'status'|'paymentStatus'|'priceUsdCents'|'selectedPlanId'|'selectedPlanName'|'estimatedDeliveryDate'|'paidAt'|'createdAt'|'paymentLinkToken'|'paymentLinkUrl'|'setupPasswordSentAt'|'stripeCheckoutSessionId'|'stripePaymentIntentId'|'assignedUserId'|'createdByAdminId'|'save'|'delete'|'toJSON'> & {
  projectName: string; clientName: string; clientEmail: string; clientWhatsapp: string|null; clientContact: string|null; notes: string|null;
  status: string; paymentStatus: string; priceUsdCents: number; selectedPlanId: number|null; selectedPlanName: string|null;
  estimatedDeliveryDate: string|null; paidAt: string|null; createdAt: string;
  paymentLinkToken: string|null; paymentLinkUrl: string|null; setupPasswordSentAt: string|null; stripeCheckoutSessionId: string|null; stripePaymentIntentId: string|null;
  assignedUserId: number|null; createdByAdminId: number;
  save(): Promise<void>; delete(): Promise<void>; toJSON(): Record<string, any>;
};
