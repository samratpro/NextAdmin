import { FastifyInstance } from 'fastify';
import { requireAuth, requireStaff, requireSuperuser } from '../../middleware/auth';
import seoService from './service';
import { SeoProject, SiteStatusRecord, OnPageRecord, TopicalMapTopic, TopicalMapRecord, OffPageRecord, GmbActivityRecord, SeoProjectAssignment, SeoPlan, SeoSubscription, SeoPlanRecord, SeoSubscriptionRecord, SeoProgressRecord } from './models';
import { z } from 'zod';
import Stripe from 'stripe';
import settings from '../../config/settings';
import { User } from '../auth/models';
import authService from '../auth/service';

const getStripe = () => {
  if (!settings.stripe.secretKey) {
    return null;
  }
  return new Stripe(settings.stripe.secretKey, {
    apiVersion: '2025-01-27.acacia' as any,
  });
};

const projectSchema = z.object({
  websiteUrl: z.string().url(),
  searchConsoleUrl: z.string().url().optional(),
  bingUrl: z.string().url().optional(),
  gmbUrl: z.string().url().optional(),
  otherTrafficUrl: z.string().url().optional(),
  keywordSheetUrl: z.string().url().optional(),
  draftSheetUrl: z.string().url().optional(),
  otherSourceUrl: z.string().url().optional(),
  competitorsUrl: z.string().url().optional(),
  clientEmail: z.string().email().optional(),
  clientWhatsapp: z.string().optional(),
  clientContact: z.string().optional(),
  assignedUserId: z.number().optional(),
  status: z.enum(['pending', 'pending_info', 'active', 'paused', 'completed']).optional()
});

const adminOnboardingSchema = z.object({
  clientName: z.string().min(1),
  email: z.string().email(),
  websiteUrl: z.string().url(),
  notes: z.string().optional(),
  searchConsoleUrl: z.string().url().optional(),
  bingUrl: z.string().url().optional(),
  gmbUrl: z.string().url().optional(),
  otherTrafficUrl: z.string().url().optional(),
  keywordSheetUrl: z.string().url().optional(),
  draftSheetUrl: z.string().url().optional(),
  otherSourceUrl: z.string().url().optional(),
  competitorsUrl: z.string().url().optional(),
  clientWhatsapp: z.string().optional(),
  clientContact: z.string().optional(),
  pricingMode: z.enum(['plan', 'custom']),
  planId: z.number().int().positive().optional(),
  customPriceUsd: z.number().min(0).optional(),
  billingType: z.enum(['onetime', 'monthly']).optional(),
  activationMode: z.enum(['payment_link', 'manual']).default('payment_link'),
  estimatedDeliveryDate: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.pricingMode === 'plan' && !data.planId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'planId is required when using an existing plan',
      path: ['planId'],
    });
  }

  if (data.pricingMode === 'custom' && data.customPriceUsd === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'customPriceUsd is required when using a custom offer',
      path: ['customPriceUsd'],
    });
  }

  if (data.pricingMode === 'custom' && !data.billingType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'billingType is required when using a custom offer',
      path: ['billingType'],
    });
  }
});

const siteStatusSchema = z.object({
  recordDate: z.string(),
  url: z.string().url(),
  scTraffic: z.number(),
  bingTraffic: z.number().optional(),
  gmbTraffic: z.number().optional(),
  otherTraffic: z.number().optional(),
  siteAge: z.string(),
  mobileSpeed: z.number().int().min(0).max(100).optional(),
  desktopSpeed: z.number().int().min(0).max(100).optional(),
  monthlyTargetNote: z.string().optional()
});

const onPageSchema = z.object({
  recordDate: z.string(),
  url: z.string().url(),
  traffic: z.number(),
  keywordPicked: z.string(),
  wordCount: z.number(),
  mobileSpeed: z.number().int().min(0).max(100).optional(),
  desktopSpeed: z.number().int().min(0).max(100).optional(),
  taskStatus: z.enum(['create_content', 'update_content', 'fix_technical']),
  workedDetails: z.string().optional()
});

const topicalMapSchema = z.object({
  recordDate: z.string(),
  mainTopicId: z.number(),
  subTopicName: z.string(),
  url: z.string().url(),
  searchVolume: z.number(),
  wordCount: z.number(),
  providedLinkUrl: z.string().url().optional()
});

const offPageSchema = z.object({
  recordDate: z.string(),
  backlinkType: z.enum(['guest_post', 'directory', 'forum', 'social', 'comment', 'citation', 'other']),
  platformUrl: z.string().url().optional(),
  sourceUrl: z.string().url(),
  anchorText: z.string(),
  receivedLinkUrl: z.string().url(),
  wordCount: z.number(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().optional()
});

const gmbActivitySchema = z.object({
  recordDate: z.string(),
  taskType: z.enum(['profile', 'post', 'review', 'media', 'audit', 'qna', 'other']),
  taskName: z.string().min(1),
  url: z.string().url().optional().or(z.literal('')),
  details: z.string().optional(),
  status: z.enum(['done', 'scheduled', 'in_progress']),
  proofUrl: z.string().url().optional().or(z.literal('')),
});

const seoProgressSchema = z.object({
  recordDate: z.string().optional(),
  taskName: z.string().min(1),
  taskUrl: z.string().or(z.literal('')).optional(),
  details: z.string().optional(),
  status: z.enum(['done', 'in_progress']).default('done'),
});


export default async function seoRoutes(fastify: FastifyInstance) {
  // --- Stripe Webhook ---
  fastify.post('/api/seo/webhooks/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
    
    const sig = request.headers['stripe-signature'];
    const endpointSecret = settings.stripe.webhookSecret;
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent((request as any).rawBody, sig as string, endpointSecret as string);
    } catch (err: any) {
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { projectId, app } = session.metadata || {};
          if (app === 'seo' && projectId) {
            const pid = parseInt(projectId);
            const project = await SeoProject.objects.get({ id: pid }) as any;
            if (project) {
              const subId = session.subscription as string;
              const isAdminCreatedProject = Number(project.createdByAdminId) !== Number(project.assignedUserId);
              project.paymentStatus = 'paid';
              project.stripeSubscriptionId = subId;
              if (project.status === 'pending') {
                project.status = isAdminCreatedProject ? 'active' : 'pending_info';
              }
              await project.save();

              // ALSO update the SeoSubscription record for administrative tracking
              const sub = await (SeoSubscription.objects.filter({ seoProjectId: pid }).first() as any);
              if (sub) {
                sub.stripeSubscriptionId = subId;
                sub.status = 'active';

                // If it's a subscription, fetch the current period end
                if (subId) {
                  try {
                    const stripeSub = await stripe.subscriptions.retrieve(subId);
                    sub.currentPeriodEnd = new Date((stripeSub as any).current_period_end * 1000).toISOString();
                  } catch (e) {}
                }
                await sub.save();
              }
            }
          }

          if (app === 'custom_service' && projectId) {
            const { CustomServiceProject } = await import('../custom_service/models');
            const pid = parseInt(projectId);
            const project = await CustomServiceProject.objects.get<any>({ id: pid });
            if (project) {
              project.paymentStatus = 'paid';
              project.paidAt = new Date().toISOString();
              if (project.status === 'pending') project.status = 'active';
              await project.save();
            }
          }

          if (app === 'custom_offer' && session.metadata?.offerId) {
            const { CustomOffer } = await import('../custom_offer/models');
            const offerId = parseInt(session.metadata.offerId);
            const offer = await CustomOffer.objects.get<any>({ id: offerId });
            if (offer) {
              offer.paymentStatus = 'paid';
              offer.status = 'paid'; // Remove from Offers tab & mark as complete
              offer.paidAt = new Date().toISOString();
              if (session.subscription) {
                  offer.stripeSubscriptionId = session.subscription as string;
              }
              await offer.save();
              
              const customOfferService = (await import('../custom_offer/service')).default;
              await customOfferService.convertToProject(offerId);
            }
          }
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = (invoice as any).subscription as string;
          if (subId) {
            const project = await (SeoProject.objects.filter({ stripeSubscriptionId: subId }).first() as any);
            if (project) {
              project.paymentStatus = 'paid';
              if (project.status === 'paused') project.status = 'active';
              await project.save();
              
              // Update SeoSubscription currentPeriodEnd
              const sub = await (SeoSubscription.objects.filter({ stripeSubscriptionId: subId }).first() as any);
              if (sub) {
                const stripeSub = await stripe.subscriptions.retrieve(subId);
                sub.currentPeriodEnd = new Date((stripeSub as any).current_period_end * 1000).toISOString();
                sub.status = 'active';
                await sub.save();
              }
            }
          }
          break;
        }
        case 'customer.subscription.deleted':
        case 'invoice.payment_failed': {
          const subId = (event.data.object as any).subscription || (event.data.object as any).id;
          if (typeof subId === 'string') {
             const project = await (SeoProject.objects.filter({ stripeSubscriptionId: subId }).first() as any);
             if (project) {
               project.status = 'paused';
               await project.save();
             }
             const sub = await (SeoSubscription.objects.filter({ stripeSubscriptionId: subId }).first() as any);
             if (sub) {
               sub.status = 'expired';
               await sub.save();
             }
          }
          break;
        }
      }
      reply.send({ received: true });
    } catch (err: any) {
      console.error('[Stripe Webhook Error]', err);
      reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  fastify.get('/api/seo/projects/:id/billing-status', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await SeoProject.objects.get({ id: parseInt(id) }) as any;
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    
    // Auth check
    if (!request.user!.isSuperuser && project.assignedUserId !== request.user!.userId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    reply.send({
      paymentStatus: project.paymentStatus,
      billingType: project.billingType,
      status: project.status,
      paymentLinkUrl: project.paymentLinkUrl,
    });
  });

  // --- Admin onboarding flow (Nango admin + dashboard admin view) ---

  fastify.post('/api/seo/admin/onboarding', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const data = adminOnboardingSchema.parse(request.body) as Parameters<typeof seoService.createClientAndPendingProject>[0];
      const result = await seoService.createClientAndPendingProject(data, request.user!.userId);
      reply.code(201).send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to create client project' });
    }
  });

  fastify.post('/api/seo/verify-payment', async (request, reply) => {
    try {
      const stripe = getStripe();
      if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
      const { sessionId } = request.body as { sessionId: string };
      if (!sessionId) return reply.code(400).send({ error: 'Session ID is required' });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const { projectId, app } = session.metadata || {};

      if (app === 'seo' && projectId) {
        const pid = parseInt(projectId);
        const project = await SeoProject.objects.get({ id: pid }) as any;
        if (project) {
          const subId = (session as any).subscription as string;
          project.paymentStatus = 'paid';
          if (subId) project.stripeSubscriptionId = subId;
          
          if (project.status === 'pending' || project.status === 'pending_info') project.status = 'active';
          await project.save();

          const sub = await (SeoSubscription.objects.filter({ seoProjectId: pid }).first() as any);
          if (sub) {
            sub.stripeSubscriptionId = subId;
            sub.status = 'active';
            if (subId) {
              const stripeSub = await stripe.subscriptions.retrieve(subId);
              sub.currentPeriodEnd = new Date((stripeSub as any).current_period_end * 1000).toISOString();
            }
            await sub.save();
          }
          
          const user = await User.objects.get<any>({ id: project.assignedUserId });
          const needsPasswordReset = !!(user && user.needsPasswordReset);

          const shouldSendSetupEmail = !!(
            user &&
            user.needsPasswordReset &&
            Number(project.createdByAdminId) !== Number(project.assignedUserId) &&
            !project.setupPasswordSentAt
          );

          if (shouldSendSetupEmail) {
            try {
              await seoService.sendSetupPasswordEmail(pid);
              project.setupPasswordSentAt = new Date().toISOString();
            } catch (err) {
              console.error('[seo setup email after payment]', err);
            }
          }

          // --- AUTO-LOGIN FOR GUEST FLOW ---
          if (!request.user && user) {
            const accessToken = authService.generateAccessToken(user);
            const refreshToken = await authService.generateRefreshToken(user);
            
            const isProduction = settings.environment === 'production';
            reply.setCookie('accessToken', accessToken, {
              httpOnly: true,
              secure: isProduction,
              sameSite: 'lax',
              path: '/',
              maxAge: 86400,
            });
            reply.setCookie('refreshToken', refreshToken, {
              httpOnly: true,
              secure: isProduction,
              sameSite: 'lax',
              path: '/auth/refresh',
              maxAge: 604800,
            });
          }

          return reply.send({ 
            success: true, 
            project,
            needsPasswordReset
          });
        }
      }
      reply.code(404).send({ error: 'Project not found' });
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Verification failed' });
    }
  });

  // Public endpoint for new clients to set their password after payment
  fastify.post('/api/seo/claim-account', async (request, reply) => {
    try {
      const stripe = getStripe();
      if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
      
      const { sessionId, password } = request.body as { sessionId: string; password: string };
      if (!sessionId || !password) {
        return reply.code(400).send({ error: 'Session ID and password are required' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return reply.code(400).send({ error: 'Payment not completed' });
      }

      const { projectId, app } = session.metadata || {};
      if (app !== 'seo' || !projectId) {
        return reply.code(400).send({ error: 'Invalid session metadata' });
      }

      const project = await SeoProject.objects.get({ id: parseInt(projectId) }) as any;
      if (!project) return reply.code(404).send({ error: 'Project not found' });

      // Fail-safe: Ensure project is marked as paid during claim
      if (project.paymentStatus !== 'paid') {
         project.paymentStatus = 'paid';
         // Transition to 'active' if info was already provided (onboarding flow)
         if (project.status === 'pending' || project.status === 'pending_info') project.status = 'active';
         // Map Stripe subscription if available
         const subId = (session as any).subscription as string;
         if (subId) project.stripeSubscriptionId = subId;
         await project.save();
      }

      const user = await User.objects.get<any>({ id: project.assignedUserId });
      if (!user) return reply.code(404).send({ error: 'User not found' });

      // Set password and activate
      await user.setPassword(password);
      user.isActive = true;
      user.needsPasswordReset = false; // Clear flag here too
      await user.save();

      // Log them in for seamless handoff
      const accessToken = authService.generateAccessToken(user);
      const refreshToken = await authService.generateRefreshToken(user);

      const isProduction = settings.environment === 'production';
      reply.setCookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 86400,
      });

      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/auth/refresh',
        maxAge: 604800,
      });

      return reply.send({ 
        success: true, 
        token: accessToken, 
        refreshToken,
        user: { id: user.id, username: user.username, email: user.email } 
      });
    } catch (error: any) {
      console.error('[Claim Account Error]', error);
      reply.code(400).send({ error: error.message || 'Account claim failed' });
    }
  });

  fastify.post('/api/seo/projects/:id/payment-link', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await seoService.generateProjectPaymentLink(parseInt(id, 10));
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to generate payment link' });
    }
  });

  fastify.post('/api/seo/projects/:id/setup-link', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const forceNew = Boolean((request.body as any)?.forceNew);
      const result = await seoService.ensureSetupPasswordLink(parseInt(id, 10), forceNew);
      reply.send({ setupPasswordUrl: result.url, token: result.token });
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to generate setup link' });
    }
  });

  fastify.post('/api/seo/projects/:id/setup-email', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await seoService.sendSetupPasswordEmail(parseInt(id, 10));
      reply.send(result);
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to send setup email' });
    }
  });

  fastify.post('/api/seo/projects/:id/manual-activate', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await seoService.activateProjectManually(parseInt(id, 10));
      reply.send({
        success: true,
        project: result.project,
        setupPasswordUrl: result.setupPasswordUrl,
      });
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to activate project manually' });
    }
  });

  fastify.patch('/api/seo/projects/:id/payment-status', { preHandler: requireSuperuser }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { paymentStatus } = request.body as { paymentStatus: 'paid' | 'pending' };
      const project = await SeoProject.objects.get({ id: parseInt(id) }) as any;
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      
      project.paymentStatus = paymentStatus;
      if (paymentStatus === 'paid' && project.status === 'pending') {
         const isAdminCreatedProject = Number(project.createdByAdminId) !== Number(project.assignedUserId);
         project.status = isAdminCreatedProject ? 'active' : 'pending_info';
      }
      await project.save();
      
      reply.send({ success: true, project });
    } catch (error: any) {
      reply.code(400).send({ error: error.message || 'Failed to update payment status' });
    }
  });


  // --- Project Routes ---
  
  // List Projects (Role-based filtering)
  fastify.get('/api/seo/projects', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const projects = await seoService.getProjectsForUser(user);
    
    // Filter out client fields for staff/users
    let filteredProjects = projects.map(p => seoService.filterProjectFields(p, user));

    // For admins, enrich with subscription next-payment date
    if (user.isSuperuser || user.isStaff) {
      filteredProjects = await Promise.all(filteredProjects.map(async (p: any) => {
        const sub = await (SeoSubscription.objects.filter({ seoProjectId: p.id }).first() as any);
        return {
          ...p,
          currentPeriodEnd: sub?.currentPeriodEnd || null,
        };
      }));
    }

    reply.send({ projects: filteredProjects });
  });

  // Create Project (Admin Only)
  fastify.post('/api/seo/projects', { preHandler: requireSuperuser }, async (request, reply) => {
    const data = projectSchema.parse(request.body);
    const project = await SeoProject.objects.create({
      ...data,
      createdByAdminId: request.user!.userId
    });
    reply.code(201).send({ project });
  });

  // Get Single Project (Role-based filtering)
  fastify.get('/api/seo/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await SeoProject.objects.get({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const user = request.user!;
    if (!user.isSuperuser) {
      const assigned = await seoService.isUserAssignedToProject(user.userId, parseInt(id));
      if (!assigned) return reply.code(403).send({ error: 'Forbidden' });
    }

    reply.send({ project: seoService.filterProjectFields(project, user) });
  });

  // --- User lookup for Team management ---

  // All staff users (small list, always load)
  fastify.get('/api/seo/users/staff', { preHandler: requireSuperuser }, async (request, reply) => {
    const db = (await import('../../core/database')).default.getAdapter();
    const rows = await db.all<any>(
      `SELECT id, username, email, isStaff, isSuperuser FROM users WHERE isStaff = 1 OR isSuperuser = 1 ORDER BY username ASC`,
      []
    );
    reply.send({ users: rows });
  });

  // Search regular users (clients) by query
  fastify.get('/api/seo/users/search', { preHandler: requireSuperuser }, async (request, reply) => {
    const { q = '' } = request.query as { q?: string };
    const db = (await import('../../core/database')).default.getAdapter();
    
    if (!q.trim()) {
      // Return 20 most recent clients by default
      const rows = await db.all<any>(
        `SELECT id, username, email, isStaff, isSuperuser FROM users WHERE isStaff = 0 AND isSuperuser = 0 ORDER BY id DESC LIMIT 20`,
        []
      );
      return reply.send({ users: rows });
    }

    const like = `%${q.trim()}%`;
    const rows = await db.all<any>(
      `SELECT id, username, email, isStaff, isSuperuser FROM users WHERE isStaff = 0 AND isSuperuser = 0 AND (username LIKE ? OR email LIKE ?) ORDER BY username ASC LIMIT 20`,
      [like, like]
    );
    reply.send({ users: rows });
  });

  // --- Assignment Routes (Admin Only) ---
  fastify.get('/api/seo/projects/:id/assignments', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const users = await seoService.getAssignedUsers(parseInt(id));
    reply.send({ users });
  });

  fastify.post('/api/seo/projects/:id/assignments', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: number };
    const existing = await SeoProjectAssignment.objects.get({ seoProjectId: parseInt(id), userId });
    if (existing) return reply.code(409).send({ error: 'Already assigned' });
    const assignment = await SeoProjectAssignment.objects.create({ seoProjectId: parseInt(id), userId });
    reply.code(201).send({ assignment });
  });

  fastify.delete('/api/seo/projects/:id/assignments/:userId', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const pid = parseInt(id);
    const uid = parseInt(userId);
    
    // Check if user is in assignments table
    const assignment = await SeoProjectAssignment.objects.get({ seoProjectId: pid, userId: uid });
    if (assignment) {
      await (assignment as any).delete();
      return reply.send({ success: true });
    }
    
    // Check if user is the direct client
    const project = await SeoProject.objects.get({ id: pid }) as any;
    if (project && project.assignedUserId === uid) {
      project.assignedUserId = null;
      await project.save();
      return reply.send({ success: true });
    }
    
    // If not found in either, return success anyway (idempotent delete)
    reply.send({ success: true });
  });

  // Bulk replace all assignments for a project
  fastify.put('/api/seo/projects/:id/assignments', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userIds } = request.body as { userIds: number[] };
    const projectId = parseInt(id);
    // Remove all existing
    const existing = await SeoProjectAssignment.objects.filter({ seoProjectId: projectId }).all();
    await Promise.all(existing.map((a: any) => a.delete()));
    // Add new
    await Promise.all(userIds.map((userId) =>
      SeoProjectAssignment.objects.create({ seoProjectId: projectId, userId })
    ));
    reply.send({ success: true });
  });

  // Update Project (Admin Only)
  fastify.put('/api/seo/projects/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = projectSchema.parse(request.body);
    const project = await SeoProject.objects.get({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    
    Object.assign(project, data);
    await (project as any).save();
    reply.send({ project });
  });

  // --- Record Routes (Admin + Staff can add/edit, Users read-only) ---

  // Site Status
  fastify.get('/api/seo/projects/:id/site-status', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const user = request.user!;
    const all = await SiteStatusRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    const records = all.filter((r: any) => {
      if (from && r.recordDate < from) return false;
      if (to && r.recordDate > to + 'T23:59:59') return false;
      return true;
    });
    if (user.isSuperuser || user.isStaff) {
      const withUsers = await Promise.all(records.map(async (r: any) => ({
        ...r.toJSON ? r.toJSON() : r,
        createdByUsername: r.createdById ? await seoService.resolveUsername(r.createdById) : null,
      })));
      return reply.send({ records: withUsers });
    }
    reply.send({ records });
  });

  fastify.post('/api/seo/projects/:id/site-status', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = siteStatusSchema.parse(request.body);
    const record = await SiteStatusRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId
    });
    reply.code(201).send({ record });
  });

  // On-Page
  fastify.get('/api/seo/projects/:id/on-page', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const user = request.user!;
    const all = await OnPageRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    const records = all.filter((r: any) => {
      if (from && r.recordDate < from) return false;
      if (to && r.recordDate > to + 'T23:59:59') return false;
      return true;
    });
    if (user.isSuperuser || user.isStaff) {
      const withUsers = await Promise.all(records.map(async (r: any) => ({
        ...r.toJSON ? r.toJSON() : r,
        createdByUsername: r.createdById ? await seoService.resolveUsername(r.createdById) : null,
      })));
      return reply.send({ records: withUsers });
    }
    reply.send({ records });
  });

  fastify.post('/api/seo/projects/:id/on-page', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = onPageSchema.parse(request.body);
    const record = await OnPageRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId
    });
    reply.code(201).send({ record });
  });

  // Off-Page (Encryption)
  fastify.get('/api/seo/projects/:id/off-page', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const user = request.user!;
    const all = await OffPageRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    const records = all.filter((r: any) => {
      if (from && r.recordDate < from) return false;
      if (to && r.recordDate > to + 'T23:59:59') return false;
      return true;
    });
    
    if (user.isSuperuser || user.isStaff) {
      const withUsers = await Promise.all(records.map(async (r: any) => ({
        ...r.toJSON ? r.toJSON() : r,
        password: seoService.decrypt(r.password),
        createdByUsername: r.createdById ? await seoService.resolveUsername(r.createdById) : null,
      })));
      return reply.send({ records: withUsers });
    }
    const processedRecords = records.map((r: any) => ({ ...r.toJSON ? r.toJSON() : r, password: '••••••••' }));
    reply.send({ records: processedRecords });
  });

  fastify.post('/api/seo/projects/:id/off-page', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = offPageSchema.parse(request.body);
    
    // Encrypt password if provided
    if (data.password) {
      data.password = seoService.encrypt(data.password);
    }

    const record = await OffPageRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId
    });
    reply.code(201).send({ record });
  });

  // GMB Activities
  fastify.get('/api/seo/projects/:id/gmb-activities', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const user = request.user!;
    const all = await GmbActivityRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    const records = all.filter((r: any) => {
      if (from && r.recordDate < from) return false;
      if (to && r.recordDate > to + 'T23:59:59') return false;
      return true;
    });
    if (user.isSuperuser || user.isStaff) {
      const withUsers = await Promise.all(records.map(async (r: any) => ({
        ...r.toJSON ? r.toJSON() : r,
        createdByUsername: r.createdById ? await seoService.resolveUsername(r.createdById) : null,
      })));
      return reply.send({ records: withUsers });
    }
    reply.send({ records });
  });

  fastify.post('/api/seo/projects/:id/gmb-activities', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = gmbActivitySchema.parse(request.body);
    const record = await GmbActivityRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId,
      url: data.url || null,
      proofUrl: data.proofUrl || null,
    });
    reply.code(201).send({ record });
  });

  // Progress Records (Like Custom Projects)
  fastify.get('/api/seo/projects/:id/progress', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const all = await SeoProgressRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    
    // Enrich with usernames for UI
    const withDetails = await Promise.all(all.map(async (r: any) => ({
      ...r.toJSON ? r.toJSON() : r,
      createdByUsername: r.createdById ? await seoService.resolveUsername(r.createdById) : null,
    })));

    reply.send({ records: withDetails });
  });

  fastify.post('/api/seo/projects/:id/progress', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = seoProgressSchema.parse(request.body);
    
    const record = await SeoProgressRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId,
      recordDate: data.recordDate || new Date().toISOString()
    });
    
    // Return with username for immediate UI update
    const json = (record as any).toJSON();
    return reply.code(201).send({
      ...json,
      createdByUsername: (request.user as any).username
    });
  });

  // --- Topic Management (Record Type 3) ---
  fastify.get('/api/seo/projects/:id/topics', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const topics = await TopicalMapTopic.objects.filter({ seoProjectId: parseInt(id) }).all();
    reply.send({ topics });
  });

  fastify.post('/api/seo/projects/:id/topics', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mainTopicName, mainTopicUrl } = request.body as { mainTopicName: string; mainTopicUrl?: string };
    const topic = await TopicalMapTopic.objects.create({
      seoProjectId: parseInt(id),
      mainTopicName,
      mainTopicUrl: mainTopicUrl || null,
    });
    reply.send({ topic });
  });

  fastify.put('/api/seo/projects/:id/topics/:topicId', { preHandler: requireStaff }, async (request, reply) => {
    const { topicId } = request.params as { id: string; topicId: string };
    const { mainTopicName, mainTopicUrl } = request.body as { mainTopicName: string; mainTopicUrl?: string };
    const topic = await TopicalMapTopic.objects.get({ id: parseInt(topicId) });
    if (!topic) return reply.code(404).send({ error: 'Topic not found' });
    Object.assign(topic, { mainTopicName, mainTopicUrl: mainTopicUrl || null });
    await (topic as any).save();
    reply.send({ topic });
  });

  fastify.delete('/api/seo/projects/:id/topics/:topicId', { preHandler: requireStaff }, async (request, reply) => {
    const { topicId } = request.params as { id: string; topicId: string };
    const topic = await TopicalMapTopic.objects.get({ id: parseInt(topicId) });
    if (!topic) return reply.code(404).send({ error: 'Topic not found' });
    await (topic as any).delete();
    reply.send({ success: true });
  });

  fastify.get('/api/seo/projects/:id/topical-map', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const all = await TopicalMapRecord.objects.filter({ seoProjectId: parseInt(id) }).orderBy('recordDate', 'DESC').all();
    const records = all.filter((r: any) => {
      if (from && r.recordDate < from) return false;
      if (to && r.recordDate > to + 'T23:59:59') return false;
      return true;
    });
    reply.send({ records });
  });

  fastify.post('/api/seo/projects/:id/topical-map', { preHandler: requireStaff }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = topicalMapSchema.parse(request.body);
    const record = await TopicalMapRecord.objects.create({
      ...data,
      seoProjectId: parseInt(id),
      createdById: request.user!.userId
    });
    reply.code(201).send({ record });
  });

  // ── SEO Plans (Admin CRUD) ──────────────────────────────────────────────────

  fastify.get('/api/seo/plans', { preHandler: requireAuth }, async (_request, reply) => {
    const plans = await SeoPlan.objects.filter<SeoPlanRecord>({ isActive: true }).all();
    reply.send({ plans });
  });

  fastify.get('/api/seo/plans/all', { preHandler: requireSuperuser }, async (_request, reply) => {
    const plans = await SeoPlan.objects.all<SeoPlanRecord>().all();
    reply.send({ plans });
  });

  fastify.post('/api/seo/plans', { preHandler: requireSuperuser }, async (request, reply) => {
    const body = request.body as any;
    const plan = await SeoPlan.objects.create<SeoPlanRecord>({
      name:            body.name,
      description:     body.description     || null,
      priceUsdCents:   body.priceUsdCents   ?? 0,
      billingType:     body.billingType     || 'onetime',
      stripeProductId: body.stripeProductId || null,
      stripePriceId:   body.stripePriceId   || null,
      isActive:        body.isActive        ?? true,
    });
    reply.code(201).send({ plan });
  });

  fastify.put('/api/seo/plans/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await SeoPlan.objects.get<SeoPlanRecord>({ id: parseInt(id) });
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });
    Object.assign(plan, request.body);
    await (plan as any).save();
    reply.send({ plan });
  });

  fastify.delete('/api/seo/plans/:id', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await SeoPlan.objects.get<SeoPlanRecord>({ id: parseInt(id) });
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });
    (plan as any).isActive = false;
    await (plan as any).save();
    reply.send({ success: true });
  });

  // ── SEO Subscribe (Client) ──────────────────────────────────────────────────

  // List my SEO subscriptions
  fastify.get('/api/seo/my-subscriptions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const subs = await SeoSubscription.objects.filter<SeoSubscriptionRecord>({ userId }).all();
    const enriched = await Promise.all(subs.map(async (s: any) => {
      const plan = await SeoPlan.objects.get<SeoPlanRecord>({ id: s.planId });
      return { ...s, planName: plan?.name ?? '—', billingType: plan?.billingType ?? '—' };
    }));
    reply.send({ subscriptions: enriched });
  });

  // Purchase / start a plan
  fastify.post('/api/seo/subscribe', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { planId } = request.body as { planId: number };

    const plan = await SeoPlan.objects.get<SeoPlanRecord>({ id: planId });
    if (!plan || !plan.isActive) return reply.code(404).send({ error: 'Plan not found or inactive' });

    // Create a pending project so the user sees something in their dashboard to "Set Up"
    const project = await SeoProject.objects.create({
      websiteUrl: 'Pending Setup',
      status: 'pending_info',
      assignedUserId: userId,
      createdByAdminId: 1, // System admin
    }) as any;

    const sub = await SeoSubscription.objects.create<SeoSubscriptionRecord>({
      userId,
      planId,
      seoProjectId: project.id,
      status: 'active',
    });

    // For monthly plans with Stripe
    if (plan.billingType === 'monthly' && plan.stripePriceId) {
      const stripe = getStripe();
      if (!stripe) {
        return reply.code(400).send({ error: 'Stripe is not configured on this server.' });
      }
      
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          mode: 'subscription',
          success_url: `${settings.frontendUrl}/dashboard/seo/projects/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${settings.frontendUrl}/dashboard/seo/plans`,
          customer_email: request.user!.email,
          metadata: {
            userId: userId.toString(),
            planId: planId.toString(),
            projectId: project.id.toString(),
            app: 'seo',
          },
        });

        // Store session ID in project for tracking
        project.stripeCheckoutSessionId = session.id;
        await project.save();

        return reply.send({ success: true, stripeUrl: session.url });
      } catch (err: any) {
        return reply.code(400).send({ 
          error: `Stripe Error: ${err.message}` 
        });
      }
    }

    // Free or non-stripe fallback: finalize the subscription now
    const periodEnd = plan.billingType === 'monthly'
      ? new Date(Date.now() + 30 * 86400000).toISOString()
      : null;

    if (periodEnd) {
      (sub as any).currentPeriodEnd = periodEnd;
      await (sub as any).save();
    }

    reply.code(201).send({ success: true, subscription: sub, projectId: project.id });
  });

  // ── Client fills in website info ────────────────────────────────────────────

  fastify.patch('/api/seo/projects/:id/client-info', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;
    const project = await SeoProject.objects.get({ id: parseInt(id) }) as any;

    if (!project) return reply.code(404).send({ error: 'Project not found' });
    // Only the assigned user, admin (superuser), or staff can edit info
    const isAdminOrStaff = request.user!.isSuperuser || request.user!.isStaff;
    if (!isAdminOrStaff && Number(project.assignedUserId) !== Number(userId)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = request.body as any;

    if (body.websiteUrl)           project.websiteUrl           = body.websiteUrl;
    if (body.clientWhatsapp)       project.clientWhatsapp       = body.clientWhatsapp;
    if (body.clientEmail)          project.clientEmail          = body.clientEmail;
    if (body.clientContact)        project.clientContact        = body.clientContact;
    if (body.websiteAdminUrl)      project.websiteAdminUrl      = body.websiteAdminUrl;
    if (body.websiteAdminUsername) project.websiteAdminUsername = body.websiteAdminUsername;
    if (body.websiteAdminPassword) project.websiteAdminPassword = seoService.encrypt(body.websiteAdminPassword);
    if (body.panelLoginUrl)        project.panelLoginUrl        = body.panelLoginUrl;
    if (body.panelUsername)        project.panelUsername        = body.panelUsername;
    if (body.panelPassword)        project.panelPassword        = seoService.encrypt(body.panelPassword);

    // Mark as active once info is submitted
    if (project.status === 'pending_info') project.status = 'active';

    await project.save();
    reply.send({ success: true, project });
  });

  // ── Admin: Project Lifecycle Status ──────────────────────────────────────────
  fastify.patch('/api/seo/projects/:id/status', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    if (!['active', 'paused', 'completed'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status. Must be active, paused, or completed.' });
    }

    const project = await SeoProject.objects.get({ id: parseInt(id) }) as any;
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    project.status = status;
    await project.save();

    reply.send({ success: true, status: project.status });
  });
}
