import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { seoService, PageSeo, GlobalSeoSettings, SitemapConfig, RedirectRule } from './service';
import { 
  requireAuth, 
  requireSuperuser, 
  requireBasicAuthSuperuser,
  requirePermission
} from '../../middleware/auth';
import logger from '../../core/logger';

export default async function seoRoutes(fastify: FastifyInstance) {
  // Register multipart locally
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit for SEO images
    }
  });
  
  // --- Public Endpoints (For Frontend) ---

  // Get SEO metadata for a specific page slug
  fastify.get<{ Querystring: { slug: string } }>('/api/seo/head', async (request, reply) => {
    const { slug } = request.query;
    if (!slug) return reply.status(400).send({ error: 'Slug is required' });
    
    const data = seoService.getPageSeo(slug);
    reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return data || {};
  });

  // Get global header/footer scripts
  fastify.get('/api/seo/scripts', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return seoService.getGlobalSettings();
  });

  // Get robots.txt content
  fastify.get('/api/seo/robots-text', async (_request, reply) => {
    const content = seoService.getRobotsContent();
    reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return { content };
  });

  // Get sitemap data (list of URLs)
  fastify.get('/api/seo/sitemap-data', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return await seoService.getSitemapData();
  });

  // Public redirect rules — consumed by the frontend (port 3000)
  fastify.get('/api/seo/redirects', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return seoService.getRedirects();
  });


  // --- Admin Endpoints (Protected) ---

  // Robots.txt
  fastify.get('/api/admin/seo/robots', { preHandler: [requirePermission('seo.manage')] }, async () => {
    return { content: seoService.getRobotsContent() };
  });

  fastify.post<{ Body: { content: string } }>('/api/admin/seo/robots', { preHandler: [requirePermission('seo.manage')] }, async (request, reply) => {
    seoService.updateRobotsContent(request.body.content);
    return { success: true };
  });

  // Global Settings (Scripts)
  fastify.get('/api/admin/seo/scripts', { preHandler: [requirePermission('seo.manage')] }, async () => {
    return seoService.getGlobalSettings();
  });

  fastify.post<{ Body: GlobalSeoSettings }>('/api/admin/seo/scripts', { preHandler: [requirePermission('seo.manage')] }, async (request, reply) => {
    seoService.updateGlobalSettings(request.body);
    return { success: true };
  });

  // Page SEO CRUD
  fastify.get('/api/admin/seo/pages', { preHandler: [requirePermission('seo.manage')] }, async () => {
    const slugs = seoService.listAllPageSeoSlugs();
    const pages = slugs.map(slug => seoService.getPageSeo(slug)).filter(Boolean);
    return pages;
  });

  fastify.post<{ Body: PageSeo }>('/api/admin/seo/pages', { preHandler: [requirePermission('seo.manage')] }, async (request, reply) => {
    seoService.updatePageSeo(request.body.pageSlug, request.body);
    return { success: true };
  });

  fastify.delete<{ Querystring: { slug: string } }>('/api/admin/seo/pages', { preHandler: [requirePermission('seo.manage')] }, async (request, reply) => {
    const { slug } = request.query;
    if (!slug) return reply.status(400).send({ error: 'Slug is required' });
    seoService.deletePageSeo(slug);
    return { success: true };
  });

  // Sitemap Config
  fastify.get('/api/admin/seo/sitemap', { preHandler: [requirePermission('seo.manage')] }, async () => {
    return seoService.getSitemapConfig();
  });

  fastify.post<{ Body: SitemapConfig }>('/api/admin/seo/sitemap', { preHandler: [requirePermission('seo.manage')] }, async (request, reply) => {
    seoService.updateSitemapConfig(request.body);
    return { success: true };
  });

  // Image Upload  POST /api/admin/seo/upload?slug=about&type=og|twitter
  fastify.post<{ Querystring: { slug: string; type: 'og' | 'twitter' } }>(
    '/api/admin/seo/upload',
    { preHandler: [requirePermission('seo.manage')] },
    async (request, reply) => {
      const { slug, type } = request.query;

      if (!slug) return reply.status(400).send({ error: 'slug query param is required' });
      if (!type || !['og', 'twitter'].includes(type))
        return reply.status(400).send({ error: 'type must be "og" or "twitter"' });

      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      // Ensure per-slug upload folder exists
      seoService.ensurePageDirs(slug);
      const uploadDir = seoService.getPageUploadDir(slug);

      // Derive extension from original filename; fallback to jpg
      const ext = path.extname(data.filename).toLowerCase() || '.jpg';
      const filename = `${type}-image${ext}`;           // e.g. og-image.png
      const uploadPath = path.join(uploadDir, filename);

      await pipeline(data.file, fs.createWriteStream(uploadPath));

      // Safe slug mirrors safeSlug() in service
      const safeSlug = slug.replace(/^\//, '').replace(/\//g, '__') || 'home';
      return {
        success: true,
        url: `/uploads/seo/${safeSlug}/${filename}`,
      };
    }
  );

  // --- Redirect Rules (Admin) ---
  fastify.get('/api/admin/seo/redirects', { preHandler: [requirePermission('seo.manage')] }, async () => {
    return seoService.getRedirects();
  });

  fastify.post<{ Body: Omit<RedirectRule, 'id' | 'createdAt'> }>(
    '/api/admin/seo/redirects',
    { preHandler: [requirePermission('seo.manage')] },
    async (request, reply) => {
      const { from, to, type } = request.body;
      if (!from) return reply.status(400).send({ error: '"from" path is required' });
      if (type === 301 && !to) return reply.status(400).send({ error: '"to" path is required for 301 redirect' });
      if (type !== 301 && type !== 410) return reply.status(400).send({ error: 'type must be 301 or 410' });
      const rule = seoService.addRedirect({ from, to: type === 410 ? '' : to, type });
      return rule;
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/seo/redirects/:id',
    { preHandler: [requirePermission('seo.manage')] },
    async (request, reply) => {
      const deleted = seoService.deleteRedirect(request.params.id);
      if (!deleted) return reply.status(404).send({ error: 'Rule not found' });
      return { success: true };
    }
  );

  logger.info('SEO routes registered');
}
