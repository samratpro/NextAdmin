import { FastifyInstance } from 'fastify';
import { requireAuth, requireStaff } from '../../middleware/auth';
import customOfferService from './service';
import { CustomOffer } from './models';
import { z } from 'zod';
import settings from '../../config/settings';

const emptyToNull = (val: any) => (val === '' || val === undefined ? null : val);

const customOfferSchema = z.object({
    type: z.enum(['seo', 'custom']),
    clientName: z.string().min(1),
    clientEmail: z.string().email(),
    clientWhatsapp: z.any().transform(emptyToNull).pipe(z.string().nullable().optional()),
    clientContact: z.any().transform(emptyToNull).pipe(z.string().nullable().optional()),
    websiteUrl: z.any().transform(emptyToNull).pipe(z.string().url().nullable().optional()),
    projectName: z.any().transform(emptyToNull).pipe(z.string().nullable().optional()),
    projectInfo: z.string().min(1),
    proposedPriceUsdCents: z.number().int().min(1, 'Please enter a valid amount'),
    proposedDeliveryDate: z.any().transform(emptyToNull).pipe(z.string().nullable().optional()),
    isMonthly: z.boolean().default(false),
});

const acceptOfferSchema = z.object({
    priceUsdCents: z.number().int().min(1),
    deliveryDate: z.string().nullish(),
    notes: z.string().optional(),
});

export default async function (fastify: FastifyInstance) {
    // Verify payment after Stripe redirect — processes the offer synchronously (no webhook needed)
    fastify.post('/api/custom-offer/verify-payment', {
        preHandler: [requireAuth],
        schema: { tags: ['Offers'], security: [{ bearerAuth: [] }] }
    }, async (request, reply) => {
        try {
            const { sessionId } = request.body as { sessionId: string };
            if (!sessionId) return reply.code(400).send({ error: 'sessionId is required' });

            if (!settings.stripe?.secretKey) {
                return reply.code(500).send({ error: 'Stripe not configured' });
            }

            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(settings.stripe.secretKey, { apiVersion: '2025-01-27.acacia' as any });

            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session.payment_status !== 'paid') {
                return reply.code(400).send({ error: 'Payment not completed' });
            }

            const { app, offerId } = session.metadata || {};
            if ((app !== 'custom_offer' && session.metadata?.type !== 'custom_offer') || !offerId) {
                return reply.code(400).send({ error: 'Invalid session metadata' });
            }

            const id = parseInt(offerId);
            const offer = await CustomOffer.objects.get<any>({ id });
            if (!offer) return reply.code(404).send({ error: 'Offer not found' });

            // Idempotent: already processed
            if (offer.paymentStatus === 'paid') {
                let saved = false;
                if (!offer.userId && request.user?.userId) {
                    offer.userId = request.user.userId;
                    saved = true;
                }
                
                if (saved) {
                    await offer.save();
                    // Also update the created project
                    if (offer.convertedProjectId) {
                        if (offer.type === 'seo') {
                            const { SeoProject } = await import('../seo/models');
                            const proj = await SeoProject.objects.get<any>({ id: offer.convertedProjectId });
                            if (proj && !proj.assignedUserId) {
                                proj.assignedUserId = request.user!.userId;
                                await proj.save();
                            }
                        } else {
                            const { CustomServiceProject } = await import('../custom_service/models');
                            const proj = await CustomServiceProject.objects.get<any>({ id: offer.convertedProjectId });
                            if (proj && !proj.assignedUserId) {
                                proj.assignedUserId = request.user!.userId;
                                await proj.save();
                            }
                        }
                    }
                }

                return reply.send({ 
                    success: true, 
                    alreadyProcessed: true,
                    projectId: offer.convertedProjectId,
                    offerType: offer.type 
                });
            }

            if (!offer.userId && request.user?.userId) {
                offer.userId = request.user.userId;
            }

            offer.paymentStatus = 'paid';
            offer.status = 'paid';
            offer.paidAt = new Date().toISOString();
            if (session.subscription) {
                offer.stripeSubscriptionId = session.subscription as string;
            }
            await offer.save();

            const result = await customOfferService.convertToProject(id);
            
            return reply.send({ 
                success: true,
                projectId: (result as any).id,
                offerType: offer.type
            });
        } catch (error: any) {
            console.error('[Custom Offer Verify Payment]', error);
            return reply.code(500).send({ error: error.message || 'Verification failed' });
        }
    });


    // Public endpoint for submitting an offer (Anonymous)
    fastify.post('/api/public/custom-offer', {
        schema: {
            tags: ['Offers'],
            description: 'Submit a custom offer from the public site'
        }
    }, async (request, reply) => {
        try {
            const data = customOfferSchema.parse(request.body);
            const offer = await customOfferService.createOffer(data);
            return reply.code(201).send(offer);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                const message = error.errors.map(e => e.message).join('. ');
                return reply.code(400).send({ error: message });
            }
            return reply.code(400).send({ error: error.message });
        }
    });

    // Authenticated endpoint for submitting an offer (Dashboard)
    fastify.post('/api/custom-offer/submit', {
        preHandler: [requireAuth],
        schema: {
            tags: ['Offers'],
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        try {
            const user = (request as any).user;
            const data = customOfferSchema.parse(request.body);
            const offer = await customOfferService.createOffer(data, user.userId);
            return reply.code(201).send(offer);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                const message = error.errors.map(e => e.message).join('. ');
                return reply.code(400).send({ error: message });
            }
            return reply.code(400).send({ error: error.message });
        }
    });

    // List offers (Staff see all, Clients see their own)
    fastify.get('/api/custom-offer', {
        preHandler: [requireAuth],
        schema: {
            tags: ['Offers'],
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        try {
            const user = (request as any).user;
            const query = request.query as any;
            const filters: any = {};
            if (query.type) filters.type = query.type;
            if (query.status) filters.status = query.status;
            
            // If not staff, force filter by userId
            if (!user.isStaff && !user.isSuperuser) {
                filters.userId = user.userId;
            }
            
            const offers = await CustomOffer.objects.filter(filters).orderBy('createdAt', 'DESC').all();
            return offers;
        } catch (error: any) {
            return reply.code(500).send({ error: error.message });
        }
    });

    // Get single offer details
    fastify.get('/api/custom-offer/:id', {
        preHandler: [requireAuth],
        schema: {
            tags: ['Offers'],
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as any;
            const user = (request as any).user;
            const offer = await CustomOffer.objects.get<any>({ id: parseInt(id) });
            
            if (!offer) return reply.code(404).send({ error: 'Offer not found' });
            
            // Security: only owner or staff can view
            if (offer.userId !== user.userId && !user.isStaff && !user.isSuperuser) {
                return reply.code(403).send({ error: 'Access denied' });
            }
            
            return offer;
        } catch (error: any) {
            return reply.code(500).send({ error: error.message });
        }
    });

    // Admin endpoint to accept and modify offer
    fastify.patch('/api/custom-offer/:id/accept', {
        preHandler: [requireStaff],
        schema: {
            tags: ['Offers'],
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as any;
            const data = acceptOfferSchema.parse(request.body);
            const offer = await customOfferService.acceptOffer(parseInt(id), data);
            return offer;
        } catch (error: any) {
            return reply.code(400).send({ error: error.message });
        }
    });

    // Client endpoint to initiate payment
    fastify.post('/api/custom-offer/:id/pay', {
        preHandler: [requireAuth],
        schema: {
            tags: ['Offers'],
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params as any;
            const user = (request as any).user;
            const offer = await CustomOffer.objects.get<any>({ id: parseInt(id) });

            if (!offer) return reply.code(404).send({ error: 'Offer not found' });
            if (offer.userId !== user.userId) return reply.code(403).send({ error: 'Access denied' });
            if (offer.status !== 'accepted') return reply.code(400).send({ error: 'Offer is not accepted yet' });
            if (offer.paymentStatus === 'paid') return reply.code(400).send({ error: 'Offer already paid' });

            if (!settings.stripe?.secretKey) {
                return reply.code(500).send({ error: 'Stripe not configured' });
            }

            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(settings.stripe.secretKey, { apiVersion: '2025-01-27.acacia' as any });

            const isMonthly = offer.isMonthly;
            const sessionData: any = {
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: offer.type === 'seo' ? `SEO Custom Plan - ${offer.websiteUrl}` : `Custom Service - ${offer.projectName}`,
                                description: offer.projectInfo,
                            },
                            unit_amount: offer.adminPriceUsdCents || offer.proposedPriceUsdCents,
                            recurring: isMonthly ? { interval: 'month' } : undefined,
                        },
                        quantity: 1,
                    },
                ],
                mode: isMonthly ? 'subscription' : 'payment',
                success_url: `${settings.frontendUrl}/dashboard/success?session_id={CHECKOUT_SESSION_ID}&type=custom_offer&offerType=${offer.type}&id=${offer.id}`,
                cancel_url: `${settings.frontendUrl}/dashboard/offers/${offer.id}/pay`,
                customer_email: user.email,
                metadata: {
                    app: 'custom_offer',
                    offerId: offer.id.toString(),
                    userId: user.userId.toString(),
                    type: offer.type,
                },
            };

            const session = await stripe.checkout.sessions.create(sessionData);
            return { stripeUrl: session.url };
        } catch (error: any) {
            return reply.code(400).send({ error: error.message });
        }
    });
}
