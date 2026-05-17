import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { requireSuperuser } from '../../middleware/auth';
import settingsService, { SETTINGS_UPLOADS_DIR } from './service';

export default async function settingsRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  });

  // Public read — frontend can fetch without auth
  fastify.get('/api/settings', async (_request, reply) => {
    reply.send({ settings: settingsService.get() });
  });

  // Admin read
  fastify.get('/api/admin/settings', {
    preHandler: requireSuperuser,
  }, async (_request, reply) => {
    reply.send({ settings: settingsService.get() });
  });

  // Admin update
  fastify.put('/api/admin/settings', {
    preHandler: requireSuperuser,
  }, async (request, reply) => {
    const body = request.body as Record<string, any>;
    const allowed = ['siteTitle', 'tagline', 'logoUrl', 'faviconUrl', 'footerText', 'contactEmail', 'siteUrl', 'primaryColor'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const settings = settingsService.update(updates);
    reply.send({ success: true, settings });
  });

  // Upload logo or favicon
  fastify.post<{ Querystring: { type: 'logo' | 'favicon' } }>(
    '/api/admin/settings/upload',
    { preHandler: requireSuperuser },
    async (request, reply) => {
      const { type } = request.query;
      if (type !== 'logo' && type !== 'favicon') {
        return reply.status(400).send({ error: 'type must be "logo" or "favicon"' });
      }

      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const ext = path.extname(data.filename).toLowerCase() || '.png';
      const filename = `${type}${ext}`;
      const uploadPath = path.join(SETTINGS_UPLOADS_DIR, filename);

      await pipeline(data.file, fs.createWriteStream(uploadPath));

      const url = `/uploads/settings/${filename}`;
      settingsService.update(type === 'logo' ? { logoUrl: url } : { faviconUrl: url });

      return { success: true, url };
    }
  );
}
