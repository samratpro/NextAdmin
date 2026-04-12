import crypto from 'crypto';
import settings from '../../config/settings';
import { SeoProject, SiteStatusRecord, OnPageRecord, TopicalMapTopic, TopicalMapRecord, OffPageRecord, SeoProjectAssignment, SeoPlan } from './models';
import { User } from '../auth/models';
import authService from '../auth/service';
import emailService from '../../core/email';

interface CreateClientProjectInput {
  clientName: string;
  email: string;
  websiteUrl: string;
  notes?: string;
  billingType?: 'onetime' | 'monthly';
  pricingMode: 'plan' | 'custom';
  planId?: number;
  customPriceUsd?: number;
  activationMode?: 'payment_link' | 'manual';
  searchConsoleUrl?: string;
  bingUrl?: string;
  gmbUrl?: string;
  otherTrafficUrl?: string;
  keywordSheetUrl?: string;
  draftSheetUrl?: string;
  otherSourceUrl?: string;
  competitorsUrl?: string;
  clientWhatsapp?: string;
  clientContact?: string;
  estimatedDeliveryDate?: string;
}

class SeoService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key = Buffer.from(settings.encryptionKey, 'utf-8');
  private readonly ivSize = 16;

  // --- Encryption Helpers ---
  encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(this.ivSize);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(text: string): string {
    if (!text) return '';
    const parts = text.split(':');
    if (parts.length !== 2) return text; // Not encrypted correctly
    const [ivHex, encryptedText] = parts;

    if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(encryptedText)) {
      return text;
    }

    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== this.ivSize) {
      return text;
    }

    try {
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');
      return decrypted;
    } catch {
      return '[Encrypted password unavailable]';
    }
  }

  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  private buildAbsoluteUrl(path: string): string {
    return `${this.getFrontendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private createOpaqueToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  private createDemoExternalId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private async activateProjectAccess(project: any, user: any, source: 'demo' | 'manual'): Promise<void> {
    if (project.paymentStatus === 'paid' && project.status === 'active' && user.isActive) {
      return;
    }

    project.paymentStatus = 'paid';
    project.status = 'active';
    project.paidAt = new Date().toISOString();

    if (source === 'demo') {
      project.stripeCheckoutSessionId = this.createDemoExternalId('demo_cs');
      project.stripePaymentIntentId = this.createDemoExternalId('demo_pi');
      project.stripeSubscriptionId = project.billingType === 'monthly'
        ? this.createDemoExternalId('demo_sub')
        : null;
    } else {
      project.stripeCheckoutSessionId = null;
      project.stripePaymentIntentId = null;
      project.stripeSubscriptionId = null;
    }

    user.isActive = true;

    await user.save();
    await project.save();
  }

  private slugifyUsernameBase(value: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');

    return normalized || 'client';
  }

  private async generateUniqueUsername(clientName: string, email: string): Promise<string> {
    const emailPrefix = email.split('@')[0] || 'client';
    const base = this.slugifyUsernameBase(clientName || emailPrefix);

    let candidate = base;
    let counter = 1;
    while (await User.objects.get<any>({ username: candidate })) {
      counter += 1;
      candidate = `${base}.${counter}`;
    }

    return candidate;
  }

  async createClientAndPendingProject(data: CreateClientProjectInput, adminUserId: number): Promise<{ user: any; project: any; setupEmailSent: boolean; paymentEmailSent: boolean; paymentUrl: string | null; createdNewUser: boolean }> {
    const existingUser = await (User.objects.filter({ email: data.email }) as any).first();
    if (existingUser && (existingUser.isStaff || existingUser.isSuperuser)) {
      throw new Error('This email belongs to a staff/admin account and cannot be used as a client.');
    }

    let selectedPlan: any = null;
    let priceUsdCents = 0;
    let billingType: 'onetime' | 'monthly' = data.billingType || 'onetime';

    if (data.pricingMode === 'plan') {
      if (!data.planId) {
        throw new Error('Please select an existing plan.');
      }
      selectedPlan = await SeoPlan.objects.get<any>({ id: data.planId });
      if (!selectedPlan || !selectedPlan.isActive) {
        throw new Error('Selected SEO plan is unavailable.');
      }
      priceUsdCents = selectedPlan.priceUsdCents;
      billingType = selectedPlan.billingType === 'monthly' ? 'monthly' : 'onetime';
    } else {
      const customPriceUsd = Number(data.customPriceUsd ?? 0);
      if (!Number.isFinite(customPriceUsd) || customPriceUsd < 0) {
        throw new Error('Custom price must be a valid non-negative amount.');
      }
      priceUsdCents = Math.round(customPriceUsd * 100);
      billingType = data.billingType === 'monthly' ? 'monthly' : 'onetime';
    }

    const createdNewUser = !existingUser;
    let user = existingUser;
    if (!user) {
      const username = await this.generateUniqueUsername(data.clientName, data.email);
      const tempPassword = crypto.randomBytes(24).toString('hex');

      user = new User() as any;
      user.username = username;
      user.email = data.email;
      user.firstName = data.clientName;
      user.lastName = '';
      user.isActive = true;
      user.isStaff = false;
      user.isSuperuser = false;
      user.needsPasswordReset = true;
      await user.setPassword(tempPassword);
      await user.save();
    } else {
      if (!user.firstName && data.clientName) {
        user.firstName = data.clientName;
      }
      await user.save();
    }
    
    let estimatedDeliveryDate = data.estimatedDeliveryDate;
    if (!estimatedDeliveryDate && selectedPlan && selectedPlan.deliveryDays > 0) {
      const date = new Date();
      date.setDate(date.getDate() + selectedPlan.deliveryDays);
      estimatedDeliveryDate = date.toISOString();
    }

    const project = await SeoProject.objects.create({
      websiteUrl: data.websiteUrl,
      searchConsoleUrl: data.searchConsoleUrl || null,
      bingUrl: data.bingUrl || null,
      gmbUrl: data.gmbUrl || null,
      otherTrafficUrl: data.otherTrafficUrl || null,
      keywordSheetUrl: data.keywordSheetUrl || null,
      draftSheetUrl: data.draftSheetUrl || null,
      otherSourceUrl: data.otherSourceUrl || null,
      competitorsUrl: data.competitorsUrl || null,
      clientName: data.clientName,
      clientEmail: data.email,
      clientWhatsapp: data.clientWhatsapp || null,
      clientContact: data.clientContact || data.clientName,
      notes: data.notes || null,
      assignedUserId: user.id,
      createdByAdminId: adminUserId,
      status: 'pending',
      paymentStatus: 'pending',
      billingType,
      priceUsdCents,
      selectedPlanId: selectedPlan?.id ?? null,
      selectedPlanName: selectedPlan?.name ?? null,
      estimatedDeliveryDate: estimatedDeliveryDate || null,
    });

    const projectRecord = project as any;

    if (data.activationMode === 'manual') {
      await this.activateProjectAccess(projectRecord, user, 'manual');
    }

    let setupEmailSent = false;
    if (createdNewUser) {
      try {
        const { token } = await authService.createPasswordResetTokenForUser(user.id, 72);
        projectRecord.setupPasswordToken = token;
        projectRecord.setupPasswordGeneratedAt = new Date().toISOString();
        await projectRecord.save();

        setupEmailSent = await emailService.sendSetupPasswordEmail(
          user.email,
          token,
          user.username || data.clientName || user.email,
          projectRecord.websiteUrl || selectedPlan?.name || 'your SEO project'
        );

        if (setupEmailSent) {
          projectRecord.setupPasswordSentAt = new Date().toISOString();
          await projectRecord.save();
        }
      } catch (error) {
        console.error('[SEO Setup Email Error]', error);
      }
    }

    return { user, project, setupEmailSent, paymentEmailSent: false, paymentUrl: null, createdNewUser };
  }

  async generateProjectPaymentLink(projectId: number): Promise<{ project: any; paymentUrl: string; emailSent: boolean }> {
    const project = await SeoProject.objects.get<any>({ id: projectId });
    if (!project) throw new Error('Project not found');

    const sendPaymentEmail = async (paymentUrl: string): Promise<boolean> => {
      return emailService.sendCustomPaymentLinkEmail(
        project.clientEmail,
        project.clientName || project.clientEmail,
        paymentUrl,
        {
          serviceName: project.websiteUrl || project.selectedPlanName || 'SEO Service',
          planName: project.selectedPlanName || null,
          priceUsdCents: project.priceUsdCents ?? null,
          estimatedDeliveryDate: project.estimatedDeliveryDate ?? null,
        }
      );
    };

    const stripeSecret = settings.stripe.secretKey;
    if (stripeSecret) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecret, { apiVersion: '2025-01-27.acacia' as any });

      let stripePriceId = null;
      if (project.selectedPlanId) {
        const plan = await SeoPlan.objects.get<any>({ id: project.selectedPlanId });
        stripePriceId = plan?.stripePriceId;
      }

      try {
        const assignedUser = await User.objects.get<any>({ id: project.assignedUserId });
        const isNewUser = assignedUser && assignedUser.needsPasswordReset;
        const successUrl = `${settings.frontendUrl}/dashboard/seo/projects/success?session_id={CHECKOUT_SESSION_ID}${isNewUser ? '&new=1' : ''}`;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: project.billingType === 'monthly' ? 'subscription' : 'payment',
          line_items: stripePriceId
            ? [{ price: stripePriceId, quantity: 1 }]
            : [{
                price_data: {
                  currency: 'usd',
                  product_data: { name: `SEO Services: ${project.websiteUrl || 'New Project'}`, description: project.selectedPlanName || 'Custom SEO Project' },
                  unit_amount: project.priceUsdCents || 100,
                  recurring: project.billingType === 'monthly' ? { interval: 'month' } : undefined,
                },
                quantity: 1,
              }],
          success_url: successUrl,
          cancel_url: `${settings.frontendUrl}/dashboard/seo`,
          customer_email: project.clientEmail || undefined,
          metadata: {
            projectId: project.id.toString(),
            app: 'seo',
          },
        });

        project.paymentLinkUrl = session.url;
        await project.save();

        const emailSent = await sendPaymentEmail(session.url!);
        return { project, paymentUrl: session.url!, emailSent };
      } catch (err: any) {
        console.error('[Stripe Link Generation Error]', err);
      }
    }

    throw new Error('Stripe is not configured. Cannot generate payment link.');
  }

  async ensureSetupPasswordLink(projectId: number, forceNew = false): Promise<{ token: string; url: string; project: any; user: any }> {
    const project = await SeoProject.objects.get<any>({ id: projectId });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.paymentStatus !== 'paid') {
      throw new Error('Setup password link is available only after payment.');
    }
    if (!project.assignedUserId) {
      throw new Error('Project has no assigned client.');
    }

    const user = await User.objects.get<any>({ id: project.assignedUserId });
    if (!user) {
      throw new Error('Assigned client not found');
    }

    if (!forceNew && project.setupPasswordToken) {
      return {
        token: project.setupPasswordToken,
        url: this.buildAbsoluteUrl(`/setup-password?token=${project.setupPasswordToken}`),
        project,
        user,
      };
    }

    const { token } = await authService.createPasswordResetTokenForUser(user.id, 72);
    project.setupPasswordToken = token;
    project.setupPasswordGeneratedAt = new Date().toISOString();
    await project.save();

    return {
      token,
      url: this.buildAbsoluteUrl(`/setup-password?token=${token}`),
      project,
      user,
    };
  }

  async activateProjectManually(projectId: number): Promise<{ project: any; user: any; setupPasswordUrl: string }> {
    const project = await SeoProject.objects.get<any>({ id: projectId });
    if (!project) {
      throw new Error('Project not found');
    }
    if (!project.assignedUserId) {
      throw new Error('Project has no assigned client');
    }

    const user = await User.objects.get<any>({ id: project.assignedUserId });
    if (!user) {
      throw new Error('Assigned client not found');
    }

    await this.activateProjectAccess(project, user, 'manual');
    const setup = await this.ensureSetupPasswordLink(project.id, false);
    return { project, user, setupPasswordUrl: setup.url };
  }

  async sendSetupPasswordEmail(projectId: number): Promise<{ sent: boolean; setupPasswordUrl: string }> {
    const setup = await this.ensureSetupPasswordLink(projectId, false);
    if (!setup.user.needsPasswordReset) {
      return {
        sent: false,
        setupPasswordUrl: this.buildAbsoluteUrl(`/dashboard/seo/projects/${projectId}/overview`)
      };
    }

    const sent = await emailService.sendSetupPasswordEmail(
      setup.user.email,
      setup.token,
      setup.project.clientName || setup.user.username,
      setup.project.websiteUrl || 'your SEO project'
    );

    if (sent) {
      setup.project.setupPasswordSentAt = new Date().toISOString();
      await setup.project.save();
    }

    return { sent, setupPasswordUrl: setup.url };
  }

  // --- Project Filtering ---
  async getProjectsForUser(user: { userId: number; isStaff: boolean; isSuperuser: boolean }): Promise<any[]> {
    const all = await SeoProject.objects.all().all();
    
    if (user.isSuperuser) {
      return all;
    }

    // Projects directly assigned to the client (via subscription purchase)
    const directIds = new Set(
      all.filter((p: any) => Number(p.assignedUserId) === Number(user.userId)).map((p: any) => p.id)
    );

    // Projects assigned via team assignments table (staff)
    const assignments = await SeoProjectAssignment.objects.filter({ userId: user.userId }).all();
    const teamIds = new Set(assignments.map((a: any) => a.seoProjectId));

    return all.filter((p: any) => {
      const isClient = directIds.has(p.id);
      const isStaffAssigned = teamIds.has(p.id);

      // Rule: Clients always see their projects.
      // Rule: Staff ONLY see projects if they are NOT paused.
      if (isClient) return true;
      if (isStaffAssigned) {
        return p.status !== 'paused';
      }
      return false;
    });
  }

  async isUserAssignedToProject(userId: number, projectId: number): Promise<boolean> {
    // Check direct assignment (client who owns the project)
    const project = await SeoProject.objects.get({ id: projectId });
    if (project && Number((project as any).assignedUserId) === Number(userId)) return true;
    // Check team assignment
    const a = await SeoProjectAssignment.objects.get({ userId, seoProjectId: projectId });
    return !!a;
  }

  async getAssignedUsers(projectId: number): Promise<any[]> {
    const project = await SeoProject.objects.get({ id: projectId }) as any;
    const assignments = await SeoProjectAssignment.objects.filter({ seoProjectId: projectId }).all();
    const explicitIds = new Set(assignments.map((a: any) => a.userId));
    const userIds = new Set(explicitIds);
    
    // Include the primary client assigned to the project
    if (project && project.assignedUserId) {
      userIds.add(project.assignedUserId);
    }
    
    // Include ALL superusers (administrators) by default
    const allUsers = await User.objects.all().all();
    const superusers = allUsers.filter((u: any) => u.isSuperuser);
    superusers.forEach((u: any) => userIds.add(u.id));

    if (userIds.size === 0) return [];
    
    return allUsers.filter((u: any) => userIds.has(u.id)).map((u: any) => ({
      id: u.id, 
      username: u.username, 
      email: u.email, 
      isStaff: u.isStaff, 
      isSuperuser: u.isSuperuser,
      isPermanent: !explicitIds.has(u.id) // Permanent if not explicitly assigned via team table
    }));
  }

  async resolveUsername(userId: number): Promise<string> {
    const u = await User.objects.get<User>({ id: userId });
    return (u as any)?.username ?? `User #${userId}`;
  }

  // Helper to filter out sensitive client fields for staff/users
  filterProjectFields(project: any, user: { isSuperuser: boolean }) {
    if (user.isSuperuser) return project;
    const filtered = { ...project };
    delete filtered.clientEmail;
    delete filtered.clientWhatsapp;
    delete filtered.clientContact;
    delete filtered.paymentLinkToken;
    delete filtered.setupPasswordToken;
    return filtered;
  }
}

export default new SeoService();
