import crypto from 'crypto';
import settings from '../../config/settings';
import { 
  CustomServiceProject, 
  CustomServiceProgress, 
  CustomServicePlan, 
  CustomServiceAssignment, 
  CustomServiceDateExtension,
  CustomServiceProjectRecord
} from './models';
import { User } from '../auth/models';
import authService from '../auth/service';
import emailService from '../../core/email';

interface CreateCustomProjectInput {
  projectName: string;
  clientName: string;
  email: string;
  priceUsd: number;
  planId?: number;
  notes?: string;
  estimatedDeliveryDate?: string;
  clientWhatsapp?: string;
  clientContact?: string;
  googleDriveUrl?: string;
  trelloUrl?: string;
  sheetUrl?: string;
  activationMode?: 'payment_link' | 'manual';
}

class CustomService {
  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  private buildAbsoluteUrl(path: string): string {
    return `${this.getFrontendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private createOpaqueToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  private async generateUniqueUsername(clientName: string, email: string): Promise<string> {
    const emailPrefix = email.split('@')[0] || 'client';
    const base = (clientName || emailPrefix).toLowerCase().replace(/[^a-z0-9]+/g, '.');
    
    let candidate = base;
    let counter = 1;
    // Check existence without throwing
    while (await User.objects.filter({ username: candidate }).count() > 0) {
      counter += 1;
      candidate = `${base}.${counter}`;
    }
    return candidate;
  }

  async createProject(data: any, adminUserId: number): Promise<{ user: any; project: CustomServiceProjectRecord; setupEmailSent: boolean; createdNewUser: boolean }> {
    const email = data.email || data.clientEmail;
    const existingUser = await (User.objects.filter({ email }) as any).first();
    const createdNewUser = !existingUser;
    if (existingUser && (existingUser.isStaff || existingUser.isSuperuser)) {
      throw new Error('This email belongs to a staff/admin account.');
    }

    let user: any = existingUser;
    if (!user) {
      const username = await this.generateUniqueUsername(data.clientName, email);
      const tempPassword = crypto.randomBytes(24).toString('hex');
      user = new User() as any;
      user.username = username;
      user.email = email;
      user.firstName = data.clientName;
      user.isActive = true; // Activate so they can log in via successful session or token
      user.needsPasswordReset = true; // Flag for onboarding
      await user.setPassword(tempPassword);
      await user.save();
    }

    let priceCents = 0;
    let planName = 'Custom Plan';
    let planId = data.planId ? Number(data.planId) : null;

    if (data.pricingMode === 'plan' && planId) {
      const plan = await CustomServicePlan.objects.get<any>({ id: planId });
      if (plan) {
        priceCents = plan.priceUsdCents;
        planName = plan.name;
      }
    } else {
      const customPrice = data.customPriceUsd || data.priceUsd || 0;
      priceCents = Math.round(Number(customPrice) * 100);
    }

    let estimatedDeliveryDate = data.estimatedDeliveryDate;
    if (!estimatedDeliveryDate && data.pricingMode === 'plan' && planId) {
      const plan = await CustomServicePlan.objects.get<any>({ id: planId });
      if (plan && plan.deliveryDays > 0) {
        const date = new Date();
        date.setDate(date.getDate() + plan.deliveryDays);
        estimatedDeliveryDate = date.toISOString();
      }
    }

    const project = await CustomServiceProject.objects.create<CustomServiceProjectRecord>({
      projectName: data.projectName || planName,
      clientName: data.clientName,
      clientEmail: email,
      clientWhatsapp: data.clientWhatsapp || null,
      clientContact: data.clientContact || null,
      googleDriveUrl: data.googleDriveUrl || null,
      trelloUrl: data.trelloUrl || null,
      sheetUrl: data.sheetUrl || null,
      notes: data.notes || null,
      priceUsdCents: priceCents,
      selectedPlanId: planId,
      selectedPlanName: planName,
      estimatedDeliveryDate: estimatedDeliveryDate || null,
      assignedUserId: user.id || user.userId,
      createdByAdminId: adminUserId,
      status: 'pending',
      paymentStatus: 'pending',
    } as any);

    if (data.activationMode === 'manual') {
      project.paymentStatus = 'paid';
      project.status = 'active';
      project.paidAt = new Date().toISOString();
      user.isActive = true;
      await user.save();
      await project.save();
    }
    let setupEmailSent = false;
    if (createdNewUser) {
      try {
        const setupResult = await this.sendSetupPasswordEmail(Number(project.id));
        setupEmailSent = setupResult.sent;
      } catch (error) {
        console.error('[Custom Service Setup Email Error]', error);
      }
    }

    return { user, project, setupEmailSent, createdNewUser };
  }

  async generatePaymentLink(projectId: number): Promise<{ paymentUrl: string; emailSent: boolean }> {
    const project = await CustomServiceProject.objects.get<any>({ id: projectId });
    if (!project) throw new Error('Project not found');

    const stripeSecret = settings.stripe.secretKey;
    if (stripeSecret) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecret, { apiVersion: '2025-01-27.acacia' as any });

      try {
        const successUrl = `${settings.frontendUrl}/dashboard/custom-services/success?session_id={CHECKOUT_SESSION_ID}`;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { 
                name: `Custom Service: ${project.projectName}`, 
                description: project.selectedPlanName || 'Standard Custom Service' 
              },
              unit_amount: project.priceUsdCents || 1000,
            },
            quantity: 1,
          }],
          success_url: successUrl,
          cancel_url: `${settings.frontendUrl}/dashboard/custom-services`,
          customer_email: project.clientEmail || undefined,
          metadata: { projectId: project.id.toString(), app: 'custom_service' },
        });

        project.paymentLinkUrl = session.url;
        await project.save();

        const emailSent = await emailService.sendCustomPaymentLinkEmail(
          project.clientEmail,
          project.clientName || project.clientEmail,
          session.url!,
          {
            serviceName: project.projectName || project.selectedPlanName || 'Custom Service',
            planName: project.selectedPlanName || null,
            priceUsdCents: project.priceUsdCents ?? null,
            estimatedDeliveryDate: project.estimatedDeliveryDate ?? null,
          }
        );

        return { paymentUrl: session.url!, emailSent };
      } catch (err) {
        console.error('[Stripe Error]', err);
      }
    }

    throw new Error('Stripe is not configured. Cannot generate payment link.');
  }

  async sendSetupPasswordEmail(projectId: number): Promise<{ sent: boolean; setupPasswordUrl: string }> {
    const project = await CustomServiceProject.objects.get<any>({ id: projectId });
    if (!project) throw new Error('Project not found');

    const user = await User.objects.get<any>({ id: project.assignedUserId });
    if (!user) throw new Error('Assigned client not found');

    if (!user.needsPasswordReset) {
      return {
        sent: false,
        setupPasswordUrl: this.buildAbsoluteUrl(`/dashboard/custom-services/${projectId}`)
      };
    }

    const uid = Number(user.id || user.userId);
    if (!uid) throw new Error('Assigned client is missing a valid user id');

    const { token } = await authService.createPasswordResetTokenForUser(uid, 72);
    const sent = await emailService.sendSetupPasswordEmail(
      user.email,
      token,
      user.username || project.clientName || user.email,
      project.projectName || project.selectedPlanName || 'your project'
    );

    if (sent) {
      project.setupPasswordSentAt = new Date().toISOString();
      await project.save();
    }

    return { sent, setupPasswordUrl: this.buildAbsoluteUrl(`/setup-password?token=${token}`) };
  }

  async getProjectsForUser(user: { userId: number; isStaff: boolean; isSuperuser: boolean }): Promise<any[]> {
    if (user.isSuperuser) {
      return CustomServiceProject.objects.all<any>().all();
    }

    // SQL-level filter avoids JS type mismatch issues with SQLite integer vs number
    const ownedProjects = await CustomServiceProject.objects.filter<any>({ assignedUserId: user.userId }).all();
    const ownedIds = new Set(ownedProjects.map((p: any) => p.id));

    // Staff assignments
    const assignments = await CustomServiceAssignment.objects.filter({ userId: user.userId }).all();
    if (assignments.length === 0) return ownedProjects;

    const assignedProjectIds = new Set(assignments.map((a: any) => Number(a.projectId)));
    const staffProjects = await CustomServiceProject.objects.all<any>().all();

    const result = [...ownedProjects];
    for (const p of staffProjects) {
      if (ownedIds.has(p.id)) continue;
      if (assignedProjectIds.has(Number(p.id)) && p.status !== 'completed') {
        result.push(p);
      }
    }
    return result;
  }

  async extendDeliveryDate(projectId: number, newDate: string, note: string, adminUserId: number): Promise<void> {
    const project = await CustomServiceProject.objects.get<any>({ id: projectId });
    if (!project) throw new Error('Project not found');

    await CustomServiceDateExtension.objects.create({
      projectId,
      previousDate: project.estimatedDeliveryDate,
      newDate,
      note,
      createdById: adminUserId,
    });

    project.estimatedDeliveryDate = newDate;
    await project.save();
  }
}

export default new CustomService();



