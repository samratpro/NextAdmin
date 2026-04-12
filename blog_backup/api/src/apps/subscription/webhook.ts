import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import settings from '../../config/settings';
import subscriptionService from './service';
import { SeoProject, SeoSubscription } from '../seo/models';
import { CustomServiceProject, CustomServicePlan } from '../custom_service/models';
import { Plan, Subscription } from './models';
import { logStripeEvent } from '../../core/stripeLogger';
import { CustomOffer } from '../custom_offer/models';
import customOfferService from '../custom_offer/service';
import { User } from '../auth/models';

const getStripe = () => {
  if (!settings.stripe.secretKey) return null;
  return new Stripe(settings.stripe.secretKey, {
    apiVersion: '2025-01-27.acacia' as any,
  });
};

export default async function stripeWebhookRoutes(fastify: FastifyInstance) {
  // Stripe requires the raw body for signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    // Normalization to handle potential trailing slashes or proxy weirdness
    const normalizedUrl = req.url.split('?')[0].replace(/\/+$/, '');
    if (normalizedUrl === '/api/webhooks/stripe') {
      done(null, body);
    } else {
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err: any) {
        done(err, null);
      }
    }
  });

  fastify.post('/api/webhooks/stripe', async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });

    const sig = request.headers['stripe-signature'] as string;
    const webhookSecret = settings.stripe.webhookSecret;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, webhookSecret);
      logStripeEvent(`Received Stripe event: ${event.type}`, { id: event.id });
    } catch (err: any) {
      logStripeEvent(`❌ Webhook signature verification failed: ${err.message}`, { sig, secret: !!webhookSecret });
      console.error(`❌ Webhook signature verification failed: ${err.message}`);
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};

      console.log('🔔 Payment received! Metadata:', metadata);
      logStripeEvent('🔔 Checkout Session Completed!', { session: session.id, metadata });

      try {
        if (metadata.app === 'subscription') {
          // --- App Subscription Payment (Standardized to direct update) ---
          const userId = parseInt(metadata.userId);
          const appId = parseInt(metadata.appId);
          const planId = parseInt(metadata.planId);
          
          logStripeEvent('Processing App Subscription...', { userId, appId, planId });

          const plan = await Plan.objects.get({ id: planId }) as any;
          if (!plan) throw new Error(`Plan ${planId} not found`);

          let sub = await Subscription.objects.get({ userId, appId }) as any;
          if (sub) {
            logStripeEvent('Updating existing subscription', { id: sub.id });
            sub.status = 'active';
            // Merge credits logic (matches service.ts but flattened for reliability)
            sub.creditsRemaining = (sub.creditsRemaining || 0) + plan.monthlyCredits;
            sub.totalCreditsLimit = (sub.totalCreditsLimit || 0) + plan.monthlyCredits;
          } else {
            logStripeEvent('Creating initial subscription');
            sub = new Subscription() as any;
            sub.userId = userId;
            sub.appId = appId;
            sub.planId = planId;
            sub.status = 'active';
            sub.creditsRemaining = plan.monthlyCredits;
            sub.totalCreditsLimit = plan.monthlyCredits;
            sub.createdAt = new Date().toISOString();
          }

          // Map Stripe info
          const stripeSubscriptionId = session.subscription as string;
          sub.stripeSubscriptionId = stripeSubscriptionId;
          sub.stripeCustomerId = session.customer as string;
          
          if (stripeSubscriptionId) {
             const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;
             sub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
          }

          await sub.save();
          logStripeEvent('App Subscription activated successfully', { id: sub.id });

        } else if (metadata.app === 'custom_service') {
          if (metadata.projectId) {
            // --- Old flow: admin-created project, just mark as paid ---
            const projectId = parseInt(metadata.projectId);
            const project = await CustomServiceProject.objects.get<any>({ id: projectId });
            if (project) {
              project.paymentStatus = 'paid';
              project.paidAt = new Date().toISOString();
              project.stripeCheckoutSessionId = session.id;
              project.stripePaymentIntentId = (session.payment_intent as string) || null;
              if (project.status === 'pending') project.status = 'active';
              await project.save();
              logStripeEvent(`✅ Custom service project marked paid`, { projectId });
            }
          } else {
            // --- New flow: user bought from plans page, create project now ---
            const planId = parseInt(metadata.planId);
            const userId = parseInt(metadata.userId);
            const plan = await CustomServicePlan.objects.get<any>({ id: planId });
            if (!plan) throw new Error(`CustomServicePlan ${planId} not found`);

            const deliveryDate = plan.deliveryDays > 0
              ? new Date(Date.now() + plan.deliveryDays * 24 * 60 * 60 * 1000).toISOString()
              : null;
            const project = await CustomServiceProject.objects.create<any>({
              projectName: plan.name,
              clientName: metadata.userName || '',
              clientEmail: metadata.userEmail || '',
              priceUsdCents: plan.priceUsdCents,
              selectedPlanId: plan.id,
              selectedPlanName: plan.name,
              assignedUserId: userId,
              createdByAdminId: userId,
              status: 'pending',
              paymentStatus: 'paid',
              paidAt: new Date().toISOString(),
              estimatedDeliveryDate: deliveryDate,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: (session.payment_intent as string) || null,
            });
            logStripeEvent(`✅ Custom service project created after payment`, { projectId: project.id, planId });
          }

        } else if (metadata.app === 'seo') {
          // --- SEO Project Payment ---
          const projectId = parseInt(metadata.projectId);
          const project = await SeoProject.objects.get({ id: projectId }) as any;
          if (project) {
            const stripeSubscriptionId = session.subscription as string;
            project.paymentStatus = 'paid';
            if (stripeSubscriptionId) project.stripeSubscriptionId = stripeSubscriptionId;
            
            // Transition to active
            if (project.status === 'pending' || project.status === 'pending_info') {
              project.status = 'active';
            }
            await project.save();

            // Sync SEO Subscription record
            const seoSub = await SeoSubscription.objects.get({ seoProjectId: projectId }) as any;
            if (seoSub) {
              seoSub.status = 'active';
              seoSub.stripeSubscriptionId = stripeSubscriptionId;
              if (stripeSubscriptionId) {
                const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;
                seoSub.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
              }
              await seoSub.save();
            }
            console.log(`✅ SEO Project activated for ID ${projectId}`);
          }
        } else if (metadata.app === 'custom_offer' || metadata.type === 'custom_offer') {
          // --- Custom Offer Fulfillment ---
          const offerId = parseInt(metadata.offerId);
          logStripeEvent('Processing Custom Offer Payment...', { offerId });

          const offer = await CustomOffer.objects.get<any>({ id: offerId });
          if (offer) {
            offer.paymentStatus = 'paid';
            offer.status = 'paid';
            offer.paidAt = new Date().toISOString();
            
            const stripeSubscriptionId = session.subscription as string;
            if (stripeSubscriptionId) {
                offer.stripeSubscriptionId = stripeSubscriptionId;
            }
            
            await offer.save();
            logStripeEvent('Custom Offer marked as paid', { id: offer.id });

            // Convert to a running project
            await customOfferService.convertToProject(offer.id);
            logStripeEvent('Custom Offer converted to project', { id: offer.id });
          }
        }
      } catch (err: any) {
        logStripeEvent(`❌ Error processing webhook event: ${err.message}`, { stack: err.stack });
        console.error(`❌ Error processing webhook event: ${err.message}`);
      }
    }

    reply.send({ received: true });
  });
}
