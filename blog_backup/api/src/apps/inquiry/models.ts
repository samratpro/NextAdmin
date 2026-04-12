import { Model } from '../../core/model';
import { CharField, TextField, DateTimeField, IntegerField } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
    appName: 'Management',
    displayName: 'Contacts',
    icon: 'message-square',
    permissions: ['view', 'change', 'delete'],
    listDisplay: ['id', 'name', 'email', 'status', 'createdAt'],
    searchFields: ['name', 'email', 'message'],
    filterFields: ['status'],
    tabs: [
        { label: 'Awaiting', filter: { status: 'awaiting' } },
        { label: 'Contacted', filter: { status: 'contacted' } }
    ]
})
export class StrategicInquiry extends Model {
    name = new CharField({ maxLength: 255 });
    email = new CharField({ maxLength: 255 });
    company = new CharField({ maxLength: 255, nullable: true });
    whatsapp = new CharField({ maxLength: 255, nullable: true });
    contactNumber = new CharField({ maxLength: 255, nullable: true });
    message = new TextField();
    
    userId = new IntegerField({ nullable: true }); // Linked if user was logged in
    status = new CharField({ maxLength: 50, default: 'awaiting' }); // 'awaiting' | 'contacted'
    
    createdAt = new DateTimeField({ default: () => new Date().toISOString() });

    static getTableName(): string { return 'strategic_inquiries'; }
}
