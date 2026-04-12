import { Model } from '../../core/model';
import { CharField, BooleanField, DateTimeField, TextField, IntegerField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
    appName: 'Offers',
    displayName: 'Custom Offers',
    icon: 'file-text',
    permissions: ['view', 'add', 'change', 'delete'],
    listDisplay: ['id', 'clientEmail', 'type', 'status', 'paymentStatus', 'proposedPriceUsdCents', 'createdAt'],
    searchFields: ['clientEmail', 'clientName'],
    filterFields: ['status', 'type'],
})
export class CustomOffer extends Model {
    type = new CharField({ maxLength: 50 }); // 'seo' | 'custom'
    
    // Client Contact
    clientName = new CharField({ maxLength: 255 });
    clientEmail = new CharField({ maxLength: 255 });
    clientWhatsapp = new CharField({ maxLength: 255, nullable: true });
    clientContact = new CharField({ maxLength: 255, nullable: true });
    
    // Project Info
    websiteUrl = new CharField({ maxLength: 255, nullable: true });
    projectName = new CharField({ maxLength: 255, nullable: true });
    projectInfo = new TextField();
    
    // Proposals
    proposedPriceUsdCents = new IntegerField();
    proposedDeliveryDate = new DateTimeField({ nullable: true });
    isMonthly = new BooleanField({ default: false });
    
    // Admin Modifications
    adminPriceUsdCents = new IntegerField({ nullable: true });
    adminDeliveryDate = new DateTimeField({ nullable: true });
    adminNotes = new TextField({ nullable: true });
    
    // State and Tracking
    status = new CharField({ maxLength: 50, default: 'pending' }); // 'pending' | 'accepted' | 'rejected' | 'paid'
    paymentStatus = new CharField({ maxLength: 50, default: 'pending' }); // 'pending' | 'paid'
    paymentLinkUrl = new CharField({ maxLength: 500, nullable: true });
    paymentLinkToken = new CharField({ maxLength: 255, nullable: true });
    
    stripeSubscriptionId = new CharField({ maxLength: 255, nullable: true });
    paidAt = new DateTimeField({ nullable: true });

    convertedProjectId = new IntegerField({ nullable: true }); // ID of the created SeoProject or CustomServiceProject
    userId = new IntegerField({ nullable: true }); // Linked user account
    createdAt = new DateTimeField({ default: () => new Date().toISOString() });
    updatedAt = new DateTimeField({ default: () => new Date().toISOString() });

    static getTableName(): string { return 'custom_offers'; }
}
