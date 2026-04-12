import { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperuser, optionalAuthenticate } from '../../middleware/auth';
import customService from './service';
import { CustomServiceProject, CustomServiceProgress, CustomServicePlan, CustomServiceAssignment, CustomServiceDateExtension } from './models';
import settings from '../../config/settings';
import DatabaseManager from '../../core/database';

export default async function customServiceRoutes(fastify: FastifyInstance) {
  // --- Admin Endpoints ---
  
  fastify.get('/api/custom-service/assignable-users', { preHandler: requireSuperuser }, async (request) => {
    const { q } = request.query as { q?: string };
    const db = DatabaseManager.getAdapter();
    
    let query = `SELECT id, username, email, isStaff, isSuperuser FROM users`;
    const params: any[] = [];
    
    const qParam = typeof q === 'string' ? q.trim() : '';
    
    if (qParam.length > 0) {
      // Search mode: show any user matching name/email
      query += ` WHERE username LIKE ? OR email LIKE ?`;
      params.push(`%${qParam}%`, `%${qParam}%`);
    } else {
      // Default view: ONLY show Staff and Admins
      query += ` WHERE isStaff = 1 OR isStaff = '1' OR isSuperuser = 1 OR isSuperuser = '1'`;
    }
    
    query += ` ORDER BY isStaff DESC, username ASC LIMIT 100`;
    
    const rows = await db.all<any>(query, params);
    return { users: rows };
  });

  // Seed Plans (Initial Setup)
  fastify.post('/api/custom-service/admin/seed-plans', { preHandler: requireSuperuser }, async () => {
    const plans = [
      {
        name: 'WordPress Website Design',
        priceUsdCents: 20000,
        deliveryDays: 14,
        stripePriceId: 'price_1TJhstHXZ0weIsjtBmjIqRpj',
        featuresJson: '["Custom WordPress Theme", "Mobile Responsive", "SEO Optimized", "One-time payment"]'
      },
      {
        name: 'GMB Data Scraping',
        priceUsdCents: 10000,
        deliveryDays: 7,
        stripePriceId: 'price_1TJhuAHXZ0weIsjtrqA0xrr6',
        featuresJson: '["Lead Generation", "Verified Data", "CSV Export", "One-time payment"]'
      },
      {
        name: 'SEO Tools Development',
        priceUsdCents: 50000,
        deliveryDays: 30,
        stripePriceId: 'price_1TJhvTHXZ0weIsjty3jjOHUo',
        featuresJson: '["Custom Backlink Tools", "Keyword Research APIs", "Cloud Infrastructure", "One-time payment"]'
      }
    ];

    const results = [];
    for (const p of plans) {
      let plan = await CustomServicePlan.objects.get({ name: p.name });
      if (plan) {
        Object.assign(plan, p);
        await (plan as any).save();
        results.push({ name: p.name, action: 'updated', deliveryDays: p.deliveryDays });
      } else {
        await CustomServicePlan.objects.create(p);
        results.push({ name: p.name, action: 'created', deliveryDays: p.deliveryDays });
      }
    }
    return { success: true, results };
  });

  // Plans (Publicly list active plans)
  fastify.get('/api/custom-service/plans', async () => {
    const plans = await CustomServicePlan.objects.filter({ isActive: true }).all();
    return { plans };
  });

  // User-facing plan checkout
  fastify.post('/api/custom-service/plans/:id/checkout', { preHandler: optionalAuthenticate }, async (request, reply) => {
    let user = request.user!;
    const { id } = request.params as { id: string };
    const { email, clientName } = request.body as { email?: string; clientName?: string };

    if (!user && !email) {
      return reply.code(400).send({ error: 'Authentication or email is required' });
    }

    // If not logged in, find or create the user
    if (!user && email) {
      const User = (await import('../auth/models')).User;
      const existing = await (User.objects.filter({ email }) as any).first();
      if (existing) {
        user = existing as any;
        user.userId = existing.id; // Compatibility
      } else {
        const crypto = await import('crypto');
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        const tempPassword = crypto.randomBytes(24).toString('hex');
        
        const newUser = new User() as any;
        newUser.username = username;
        newUser.email = email;
        newUser.firstName = clientName || username;
        newUser.isActive = true;
        newUser.needsPasswordReset = true;
        await newUser.setPassword(tempPassword);
        await newUser.save();
        
        user = newUser;
        user.userId = newUser.id;
      }

      // Automatically log them in so they can access the success page later
      const authService = (await import('../auth/service')).default;
      const accessToken = authService.generateAccessToken(user as any);
      const refreshToken = await authService.generateRefreshToken(user as any);
      
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

    const plan = await CustomServicePlan.objects.get<any>({ id: parseInt(id) });
    if (!plan || !plan.isActive) return reply.code(404).send({ error: 'Plan not found or inactive' });

    if (plan.stripePriceId && settings.stripe?.secretKey) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(settings.stripe.secretKey, { apiVersion: '2025-01-27.acacia' as any });
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          success_url: `${settings.frontendUrl}/dashboard/custom-services/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${settings.frontendUrl}/dashboard/custom-services/plans`,
          customer_email: user.email,
          metadata: {
            app: 'custom_service',
            planId: plan.id.toString(),
            userId: user.userId.toString(),
            userName: user.username || '',
            userEmail: user.email,
            needsOnboarding: user.needsPasswordReset ? 'true' : 'false'
          },
        });
        return reply.send({ success: true, stripeUrl: session.url });
      } catch (err: any) {
        return reply.code(400).send({ error: `Stripe Error: ${err.message}` });
      }
    }

    // Fallback (no Stripe configured): create project immediately
    const project = await CustomServiceProject.objects.create<any>({
      projectName: plan.name,
      clientName: user.username,
      clientEmail: user.email,
      priceUsdCents: plan.priceUsdCents,
      selectedPlanId: plan.id,
      selectedPlanName: plan.name,
      assignedUserId: user.userId,
      createdByAdminId: user.userId,
      status: 'pending',
      paymentStatus: 'pending',
    });
    return reply.send({ success: true, stripeUrl: null, projectId: project.id });
  });

  // Projects (Protected list)
  fastify.get('/api/custom-service/projects', { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const projects = await customService.getProjectsForUser(user);
    return { projects };
  });

  // Find project by Stripe session ID — creates it here if webhook hasn't fired yet
  fastify.get('/api/custom-service/projects/by-session/:sessionId', async (request, reply) => {
    const user = request.user || null;
    const { sessionId } = request.params as { sessionId: string };

    // 1. Try to find an already-created project
    let project = await CustomServiceProject.objects.get<any>({ stripeCheckoutSessionId: sessionId });

    // 2. Webhook may not have fired yet — verify with Stripe and create/update now
    if (!project && settings.stripe?.secretKey) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(settings.stripe.secretKey, { apiVersion: '2025-01-27.acacia' as any });
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid' && session.metadata?.app === 'custom_service') {
          const { planId, projectId } = session.metadata;

          if (projectId) {
            // Case A: Admin-created project (payment link sent manually)
            project = await CustomServiceProject.objects.get<any>({ id: parseInt(projectId) });
            if (project) {
              project.paymentStatus = 'paid';
              project.paidAt = new Date().toISOString();
              project.stripeCheckoutSessionId = sessionId;
              project.stripePaymentIntentId = (session.payment_intent as string) || null;
              if (project.status === 'pending') project.status = 'active';
              await project.save();
            }
          } else if (planId) {
            // Case B: User bought a plan from the plans page
            const plan = await CustomServicePlan.objects.get<any>({ id: parseInt(planId) });
            if (plan) {
              const deliveryDate = plan.deliveryDays > 0
                ? new Date(Date.now() + plan.deliveryDays * 24 * 60 * 60 * 1000).toISOString()
                : null;
              project = await CustomServiceProject.objects.create<any>({
                projectName: plan.name,
                clientName: session.metadata.userName || (user ? user.username : ''),
                clientEmail: session.metadata.userEmail || (user ? user.email : ''),
                priceUsdCents: plan.priceUsdCents,
                selectedPlanId: plan.id,
                selectedPlanName: plan.name,
                assignedUserId: session.metadata.userId ? parseInt(session.metadata.userId) : (user ? user.userId : null),
                createdByAdminId: session.metadata.userId ? parseInt(session.metadata.userId) : (user ? user.userId : null),
                status: 'pending',
                paymentStatus: 'paid',
                paidAt: new Date().toISOString(),
                estimatedDeliveryDate: deliveryDate,
                stripeCheckoutSessionId: sessionId,
                stripePaymentIntentId: (session.payment_intent as string) || null,
              });
            }
          }
        }
      } catch (err: any) {
        console.error('[by-session] Stripe verify error:', err.message);
      }
    }

    if (!project) return reply.code(404).send({ error: 'Project not found' });
    
    // Auth check: if user is logged in, verify they own it OR session ID matches (guest flow)
    if (user) {
      if (!user.isSuperuser && Number(project.assignedUserId) !== Number(user.userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    } else {
      // If guest, project MUST match the session id (already checked by the retrieve logic above)
      if (project.stripeCheckoutSessionId !== sessionId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    }
    
    // Refresh user to get latest flag status
    const User = (await import('../auth/models')).User;
    const dbUser = await User.objects.get<any>({ id: project.assignedUserId });

    const shouldSendSetupEmail = !!(
      dbUser &&
      dbUser.needsPasswordReset &&
      Number(project.createdByAdminId) !== Number(project.assignedUserId) &&
      !project.setupPasswordSentAt
    );

    if (shouldSendSetupEmail) {
      try {
        await customService.sendSetupPasswordEmail(Number(project.id));
        project = await CustomServiceProject.objects.get<any>({ id: Number(project.id) });
      } catch (err) {
        console.error('[custom-service setup email after payment]', err);
      }
    }
    const authService = (await import('../auth/service')).default;

    // --- AUTO-LOGIN FOR GUEST FLOW ---
    // If the user is NOT logged in but we found a valid project for this session,
    // we log them in automatically so they can reach setup-password or the info form.
    if (!request.user && dbUser) {
      const accessToken = authService.generateAccessToken(dbUser);
      const refreshToken = await authService.generateRefreshToken(dbUser);
      
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

    return { 
      project: { ...project }, 
      needsPasswordReset: dbUser?.needsPasswordReset === 1 || dbUser?.needsPasswordReset === true
    };
  });

  // Client submits project info after payment
  fastify.patch('/api/custom-service/projects/:id/info', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { projectName, clientWhatsapp, clientContact, googleDriveUrl, trelloUrl, sheetUrl, notes } = request.body as any;

    const project = await CustomServiceProject.objects.get<any>({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!user.isSuperuser && Number(project.assignedUserId) !== Number(user.userId)) return reply.code(403).send({ error: 'Forbidden' });

    if (projectName)              project.projectName    = projectName;
    if (clientWhatsapp !== undefined) project.clientWhatsapp = clientWhatsapp;
    if (clientContact  !== undefined) project.clientContact  = clientContact;
    if (googleDriveUrl !== undefined) project.googleDriveUrl = googleDriveUrl;
    if (trelloUrl      !== undefined) project.trelloUrl      = trelloUrl;
    if (sheetUrl       !== undefined) project.sheetUrl       = sheetUrl;
    if (notes          !== undefined) project.notes          = notes;
    await project.save();
    return { success: true, project };
  });

  fastify.post('/api/custom-service/admin/onboarding', { preHandler: requireSuperuser }, async (request, reply) => {
    const user = request.user!;
    try {
      const result = await customService.createProject(request.body as any, user.userId);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/api/custom-service/projects/:id/payment-link', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await customService.generatePaymentLink(parseInt(id));
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/api/custom-service/projects/:id/extend-date', { preHandler: requireSuperuser }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { newDate, note } = request.body as { newDate: string; note: string };
    
    try {
      await customService.extendDeliveryDate(parseInt(id), newDate, note, user.userId);
      return { success: true };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/api/custom-service/projects/:id/status', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };
    
    const project = await CustomServiceProject.objects.get<any>({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    
    project.status = status;
    await project.save();
    return { success: true };
  });

  fastify.patch('/api/custom-service/projects/:id/payment-status', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { paymentStatus } = request.body as { paymentStatus: string };
    
    const project = await CustomServiceProject.objects.get<any>({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    
    project.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid' && !project.paidAt) {
      project.paidAt = new Date().toISOString();
    }
    await project.save();
    return { success: true };
  });
  

  // --- Assignment Routes ---
  fastify.get('/api/custom-service/projects/:id/assignments', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = (await import('../../core/database')).default.getAdapter();
    
    const project = await CustomServiceProject.objects.get<any>({ id: parseInt(id) });
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    // Join with assignments table
    const rows = await db.all<any>(
      `SELECT u.id, u.username, u.email, u.isStaff, u.isSuperuser 
       FROM users u
       JOIN custom_project_assignments a ON u.id = a.userId
       WHERE a.projectId = ?`,
      [project.id]
    );

    // Also fetch the primary assigned user and creator directly
    const primaryUsers = await db.all<any>(
       `SELECT id, username, email, isStaff, isSuperuser FROM users WHERE id IN (?, ?)`,
       [project.assignedUserId, project.createdByAdminId].filter(id => id !== null)
    );

    // Merge without duplicates
    const allUsers = [...rows];
    for (const pu of primaryUsers) {
      if (!allUsers.some(u => u.id === pu.id)) {
        allUsers.push(pu);
      }
    }

    return { users: allUsers };
  });

  fastify.post('/api/custom-service/projects/:id/assignments', { preHandler: requireSuperuser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: number };
    const existing = await CustomServiceAssignment.objects.get({ projectId: parseInt(id), userId });
    if (existing) return reply.code(409).send({ error: 'Already assigned' });
    await CustomServiceAssignment.objects.create({ projectId: parseInt(id), userId });
    return { success: true };
  });

  fastify.delete('/api/custom-service/projects/:id/assignments/:userId', { preHandler: requireSuperuser }, async (request) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const assignment = await CustomServiceAssignment.objects.get({ projectId: parseInt(id), userId: parseInt(userId) });
    if (assignment) await (assignment as any).delete();
    return { success: true };
  });


  fastify.get('/api/custom-service/users/staff', { preHandler: requireSuperuser }, async () => {
    const db = (await import('../../core/database')).default.getAdapter();
    const rows = await db.all<any>(
      `SELECT id, username, email, isStaff, isSuperuser FROM users WHERE isStaff = 1 OR isSuperuser = 1 ORDER BY username ASC`,
      []
    );
    return { users: rows };
  });

  // --- Progress Records ---
  
  fastify.get('/api/custom-service/projects/:id/progress', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = (await import('../../core/database')).default.getAdapter();
    const records = await db.all<any>(
      `SELECT p.*, u.username as createdByUsername, u.email as createdByEmail 
       FROM custom_progress_records p
       LEFT JOIN users u ON p.createdById = u.id
       WHERE p.projectId = ?
       ORDER BY p.recordDate DESC`,
      [parseInt(id)]
    );
    return { records };
  });

  fastify.post('/api/custom-service/projects/:id/progress', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    // Clients can also add notes/progress
    
    const data = request.body as any;
    
    const record = await CustomServiceProgress.objects.create({
      ...data,
      projectId: parseInt(id),
      createdById: user.userId,
    });
    
    return record;
  });

  // Extension history
  fastify.get('/api/custom-service/projects/:id/extensions', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const extensions = await CustomServiceDateExtension.objects.filter({ projectId: parseInt(id) }).orderBy('createdAt', 'DESC').all();
    return { extensions };
  });
}
