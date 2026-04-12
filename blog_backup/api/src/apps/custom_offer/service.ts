import { CustomOffer } from './models';
import { User, UserRecord } from '../auth/models';
import authService from '../auth/service';
import emailService from '../../core/email';
import { v4 as uuidv4 } from 'uuid';
import settings from '../../config/settings';
import crypto from 'crypto';
import Stripe from 'stripe';

const getStripe = () => {
    if (!settings.stripe.secretKey) return null;
    return new Stripe(settings.stripe.secretKey, {
        apiVersion: '2025-01-27.acacia' as any,
    });
};

class CustomOfferService {
    private slugifyUsernameBase(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '') || 'client';
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

    async createOffer(data: any, authUserId?: number) {
        // 1. Check if user exists or use auth user
        let user: UserRecord | null = null;
        let isNewUser = false;

        if (authUserId) {
            user = await User.objects.get<UserRecord>({ id: authUserId });
        }

        if (!user) {
            user = await User.objects.get<UserRecord>({ email: data.clientEmail });
            isNewUser = !user;
        }

        if (isNewUser) {
            const username = await this.generateUniqueUsername(data.clientName, data.clientEmail);
            const tempPassword = crypto.randomBytes(24).toString('hex');

            const newUser = new User() as any;
            newUser.username = username;
            newUser.email = data.clientEmail;
            newUser.firstName = data.clientName;
            newUser.lastName = '';
            newUser.isActive = true;
            newUser.isStaff = false;
            newUser.isSuperuser = false;
            newUser.needsPasswordReset = true;
            await newUser.setPassword(tempPassword);
            await newUser.save();
            user = newUser;
        }

        // 2. Create the offer
        if (!user) throw new Error('User not found or created');

        const offer = await CustomOffer.objects.create({
            ...data,
            userId: user.id,
            status: 'pending',
            paymentLinkToken: uuidv4(),
        });

        // 3. Send emails
        if (isNewUser) {
            // Path A: New User - Send two emails
            await emailService.sendOfferReceivedEmail(user.email, user.firstName || user.username);
            
            const { token } = await authService.createPasswordResetTokenForUser(user.id!, 72);
            await emailService.sendSetupPasswordEmail(
                user.email, 
                token, 
                user.firstName || user.username, 
                data.type === 'seo' ? (data.websiteUrl || 'SEO Plan') : (data.projectName || 'Custom Plan')
            );
        } else {
            // Path B: Existing User - Send status check email
            await emailService.sendOfferInProgressEmail(user.email, user.firstName || user.username);
        }

        return offer;
    }

    async acceptOffer(offerId: number, adminData: { priceUsdCents: number; deliveryDate?: string | null; notes?: string }) {
        const offer = await CustomOffer.objects.get<any>({ id: offerId });
        if (!offer) throw new Error('Offer not found');

        offer.adminPriceUsdCents = adminData.priceUsdCents;
        offer.adminDeliveryDate = adminData.deliveryDate;
        offer.adminNotes = adminData.notes;
        offer.status = 'accepted';
        offer.paymentStatus = 'pending';
        
        const stripe = getStripe();
        if (stripe) {
            try {
                const sessionParams: Stripe.Checkout.SessionCreateParams = {
                    payment_method_types: ['card'],
                    line_items: [],
                    metadata: {
                        app: 'custom_offer',
                        offerId: offer.id.toString(),
                    },
                    customer_email: offer.clientEmail,
                    success_url: `${settings.frontendUrl}/dashboard/success?session_id={CHECKOUT_SESSION_ID}&type=custom_offer&offerType=${offer.type}`,
                    cancel_url: `${settings.frontendUrl}/dashboard/offers?cancelled=true`,
                };

                if (offer.isMonthly) {
                    const price = await stripe.prices.create({
                        unit_amount: adminData.priceUsdCents,
                        currency: 'usd',
                        recurring: { interval: 'month' },
                        product_data: {
                            name: `Monthly ${offer.type === 'seo' ? 'SEO' : 'Custom'} Plan - ${offer.clientName}`,
                        },
                    });
                    sessionParams.mode = 'subscription';
                    sessionParams.line_items!.push({ price: price.id, quantity: 1 });
                } else {
                    sessionParams.mode = 'payment';
                    sessionParams.line_items!.push({
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `${offer.type === 'seo' ? 'SEO' : 'Custom'} Project - ${offer.clientName}`,
                            },
                            unit_amount: adminData.priceUsdCents,
                        },
                        quantity: 1,
                    });
                }

                const session = await stripe.checkout.sessions.create(sessionParams);
                offer.paymentLinkUrl = session.url;
            } catch (err: any) {
                console.error('[Stripe Accept Error]', err);
            }
        }

        await offer.save();

        const user = await User.objects.get<UserRecord>({ id: offer.userId });
        if (user) {
            const paymentUrl = offer.paymentLinkUrl || `${settings.frontendUrl}/dashboard/offers/${offer.id}/pay`;
            await emailService.sendOfferAcceptedEmail(user.email, paymentUrl, user.firstName || user.username);
        }

        return offer;
    }

    async convertToProject(offerId: number): Promise<any> {
        console.log(`[CustomOfferService] Converting offer ${offerId} to project...`);
        const offer = await CustomOffer.objects.get<any>({ id: offerId });
        if (!offer) {
            console.error(`[CustomOfferService] Offer ${offerId} not found`);
            throw new Error('Offer not found');
        }

        // Idempotency check
        if (offer.convertedProjectId) {
            console.log(`[CustomOfferService] Offer ${offerId} already converted to project ${offer.convertedProjectId}`);
            return { id: offer.convertedProjectId, type: offer.type };
        }

        try {
            if (offer.type === 'seo') {
                const { SeoProject, SeoSubscription } = await import('../seo/models');
                console.log(`[CustomOfferService] Creating SeoProject for userId ${offer.userId}...`);
                
                const project = await SeoProject.objects.create<any>({
                    websiteUrl: offer.websiteUrl || '',
                    clientName: offer.clientName || 'Unknown',
                    clientEmail: offer.clientEmail,
                    notes: offer.projectInfo || null,
                    assignedUserId: offer.userId || null,
                    createdByAdminId: offer.userId || 1,
                    status: 'active',
                    paymentStatus: 'paid',
                    billingType: offer.isMonthly ? 'monthly' : 'onetime',
                    priceUsdCents: offer.adminPriceUsdCents || offer.proposedPriceUsdCents,
                    estimatedDeliveryDate: offer.adminDeliveryDate || offer.proposedDeliveryDate,
                    customOfferId: offer.id,
                });

                console.log(`[CustomOfferService] SeoProject created with ID: ${project.id}`);

                if (offer.isMonthly) {
                    console.log(`[CustomOfferService] Creating SeoSubscription for project ${project.id}...`);
                    const sub = await SeoSubscription.objects.create<any>({
                        userId: offer.userId,
                        seoProjectId: project.id,
                        stripeSubscriptionId: offer.stripeSubscriptionId,
                        status: 'active',
                        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    });
                    project.seoSubscriptionId = sub.id;
                    await project.save();
                }

                offer.convertedProjectId = project.id;
                await offer.save();
                return project;
            } else {
                const { CustomServiceProject } = await import('../custom_service/models');
                console.log(`[CustomOfferService] Creating CustomServiceProject for userId ${offer.userId}...`);
                
                const project = await CustomServiceProject.objects.create<any>({
                    projectName: offer.projectName || 'Custom Project',
                    clientName: offer.clientName || 'Unknown',
                    clientEmail: offer.clientEmail,
                    notes: offer.projectInfo || null,
                    priceUsdCents: offer.adminPriceUsdCents || offer.proposedPriceUsdCents,
                    estimatedDeliveryDate: offer.adminDeliveryDate || offer.proposedDeliveryDate,
                    assignedUserId: offer.userId || null,
                    createdByAdminId: offer.userId || 1,
                    status: 'active',
                    paymentStatus: 'paid',
                    customOfferId: offer.id,
                });

                console.log(`[CustomOfferService] CustomServiceProject created with ID: ${project.id}`);

                offer.convertedProjectId = project.id;
                await offer.save();
                return project;
            }
        } catch (err) {
            console.error('[CustomOfferService] Conversion Error:', err);
            throw err;
        }
    }
}

export default new CustomOfferService();
