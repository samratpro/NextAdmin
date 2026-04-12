import { FastifyInstance } from 'fastify';
import { StrategicInquiry } from './models';
import { z } from 'zod';

const emptyToDefault = (val: any) => (val === '' || val === undefined ? '' : val);

const strategicInquirySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    company: z.any().transform(emptyToDefault).pipe(z.string().default('')),
    whatsapp: z.any().transform(emptyToDefault).pipe(z.string().default('')),
    contactNumber: z.any().transform(emptyToDefault).pipe(z.string().default('')),
    message: z.string().min(2, 'Message must be at least 2 characters'),
});

export default async function inquiryRoutes(fastify: FastifyInstance) {
    // Public endpoint for submitting an inquiry
    fastify.post('/api/public/inquiry', async (request, reply) => {
        try {
            const body = request.body as any;
            
            // Honeypot check
            if (body.honeypot) {
                return reply.code(200).send({ success: true, note: 'Spam prevented' });
            }

            const data = strategicInquirySchema.parse(body);

            // Manual user identification since it's a public route
            let userId = null;
            const authHeader = request.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                try {
                    const token = authHeader.substring(7);
                    const authService = (await import('../auth/service')).default;
                    const decoded = authService.verifyToken(token);
                    if (decoded) userId = decoded.userId;
                } catch (e) { /* ignore auth failure for public route */ }
            }

            const inquiry = await StrategicInquiry.objects.create<any>({
                ...data,
                userId,
                status: 'awaiting'
            });

            return reply.code(201).send({ 
                success: true, 
                message: 'Inquiry submitted successfully',
                id: inquiry.id 
            });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                const message = error.errors.map(e => e.message).join('. ');
                return reply.code(400).send({ error: message });
            }
            return reply.code(500).send({ error: error.message || 'Failed to submit inquiry' });
        }
    });
}
