import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import logger from './core/logger';
import settings from './config/settings';
import DatabaseManager from './core/database';
import emailService from './core/email';
import { ModelRegistry } from './core/ModelRegistry';
import { requireBasicAuthSuperuser } from './middleware/auth';
import permissionService from './apps/auth/permissionService';

// Import models
import {
  User,
  Group,
  Permission,
  UserPermission,
  GroupPermission,
  UserGroup,
  EmailVerificationToken,
  PasswordResetToken,
  RefreshToken
} from './apps/auth/models';



// Import routes
import authRoutes from './apps/auth/routes';
import adminRoutes from './apps/admin/routes';
import permissionsRoutes from './apps/admin/permissionsRoutes';
import backupRoutes from './apps/admin/backupRoutes';
import subscriptionRoutes from './apps/subscription/routes';
import seoRoutes from './apps/seo/routes';
import blogRoutes from './apps/blog/routes';
import stripeWebhookRoutes from './apps/subscription/webhook';
import customServiceRoutes from './apps/custom_service/routes';
import customOfferRoutes from './apps/custom_offer/routes';
import inquiryRoutes from './apps/inquiry/routes';
import { Category, BlogPost } from './apps/blog/models';
import './apps/custom_service/models';
import './apps/custom_offer/models';
import './apps/inquiry/models';


const fastify = Fastify({
  logger: {
    level: settings.debug ? 'info' : 'warn'
  }
});

async function initializeDatabase() {
  logger.info('Initializing database...');

  // Use the full database config (engine + path/url) from settings
  DatabaseManager.initialize(settings.database);

  const coreModels = [
    User,
    Group,
    Permission,
    UserPermission,
    GroupPermission,
    UserGroup,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken
  ];

  for (const model of [...coreModels, Category, BlogPost]) {
    await model.createTable();
  }


  for (const metadata of ModelRegistry.getAllModels()) {
    await metadata.model.createTable();
    await permissionService.createModelPermissions(metadata.model.name, metadata.displayName);
  }

  // Add any missing columns to existing tables (safe no-op if already present)
  // Add any missing columns to existing tables (safe no-op if already present)
  const { migrateColumns } = await import('./core/migrateColumns');
  await migrateColumns();

  logger.info('Database initialized successfully');

  // Seed demo subscription data
  const subscriptionService = (await import('./apps/subscription/service')).default;
  await subscriptionService.seedDemoData();
  
  const { seedSeoData } = await import('./apps/seo/seed');
  await seedSeoData();

  const { seedAdminUser, seedFakeUsers } = await import('./apps/auth/seedUsers');
  await seedAdminUser();
  await seedFakeUsers();

  // MIGRATION: Added deliveryDays to CustomServicePlan
  try {
    const db: any = (await import('./core/database')).default.getAdapter();
    await db.exec('ALTER TABLE custom_service_plans ADD COLUMN deliveryDays INTEGER DEFAULT 0');
    logger.info('Migration: Added deliveryDays to custom_service_plans');
  } catch (err: any) {
    logger.warn(`Migration deliveryDays skipped: ${err.message}`);
  }

  // MIGRATION: Added deliveryDays to SeoPlan
  try {
    const db: any = (await import('./core/database')).default.getAdapter();
    await db.exec('ALTER TABLE seo_plans ADD COLUMN deliveryDays INTEGER DEFAULT 0');
    logger.info('Migration: Added deliveryDays to seo_plans');
  } catch (err: any) {
    logger.warn(`Migration seo_plans deliveryDays skipped: ${err.message}`);
  }

  // MIGRATION: Added estimatedDeliveryDate to SeoProject
  try {
    const db: any = (await import('./core/database')).default.getAdapter();
    await db.exec('ALTER TABLE seo_projects ADD COLUMN estimatedDeliveryDate TEXT');
    logger.info('Migration: Added estimatedDeliveryDate to seo_projects');
  } catch (err: any) {
    logger.warn(`Migration seo_projects estimatedDeliveryDate skipped: ${err.message}`);
  }

  // MIGRATION: Fix custom_offers nullability
  try {
    const db: any = (await import('./core/database')).default.getAdapter();
    const columns = await db.all('PRAGMA table_info(custom_offers)');
    const clientContactCol = columns.find((c: any) => c.name === 'clientContact');
    
    // In PRAGMA table_info, 'notnull' is 1 if NOT NULL constraint is present
    if (clientContactCol && clientContactCol.notnull === 1) {
      logger.info('Migration: Repairing custom_offers table constraints...');
      await db.exec('PRAGMA foreign_keys = OFF');
      await db.exec('BEGIN TRANSACTION');
      
      await db.exec(`
        CREATE TABLE custom_offers_repair (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type VARCHAR(50) NOT NULL,
          clientName VARCHAR(255) NOT NULL,
          clientEmail VARCHAR(255) NOT NULL,
          clientWhatsapp VARCHAR(255),
          clientContact VARCHAR(255),
          websiteUrl VARCHAR(255),
          projectName VARCHAR(255),
          projectInfo TEXT NOT NULL,
          proposedPriceUsdCents INTEGER NOT NULL,
          proposedDeliveryDate DATETIME,
          isMonthly BOOLEAN NOT NULL DEFAULT 0,
          adminPriceUsdCents INTEGER,
          adminDeliveryDate DATETIME,
          adminNotes TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          paymentLinkToken VARCHAR(255),
          userId INTEGER,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL
        )
      `);
      
      await db.exec(`
        INSERT INTO custom_offers_repair 
        SELECT * FROM custom_offers
      `);
      
      await db.exec('DROP TABLE custom_offers');
      await db.exec('ALTER TABLE custom_offers_repair RENAME TO custom_offers');
      
      await db.exec('COMMIT');
      await db.exec('PRAGMA foreign_keys = ON');
      logger.info('Migration: custom_offers table constraints repaired successfully');
    }
  } catch (err: any) {
    logger.error(`Migration custom_offers repair failed: ${err.message}`);
  }

  logger.info('Demo data seeded');
}

async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    // Initialize email service
    emailService.initialize();

    // Register Cookie support
    await fastify.register(cookie);

    // Register Security Headers
    await fastify.register(helmet, {
      contentSecurityPolicy: settings.environment === 'production' ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "http:"],
        },
      } : false,
      crossOriginEmbedderPolicy: false,
    });

    // Register Rate Limiting
    // Global: 500 req/min per IP for dashboard GET traffic.
    // Auth and mutation routes override this with tighter per-route limits.
    await fastify.register(rateLimit, {
      max: 5000,
      timeWindow: '1 minute',
      keyGenerator: (request) =>
        request.headers['x-forwarded-for']?.toString().split(',')[0].trim()
        ?? request.ip,
    });

    // Register CORS
    await fastify.register(cors, {
      origin: settings.cors.origin,
      credentials: settings.cors.credentials
    });

    // Register Swagger
    const clientHost = settings.host === '0.0.0.0' ? 'localhost' : settings.host;
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Django-like Framework API',
          description: 'API documentation for Django-like framework built with Fastify',
          version: '1.0.0'
        },
        servers: [
          {
            url: `http://${clientHost}:${settings.port}`,
            description: 'Development server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        },
        tags: [
          { name: 'Authentication', description: 'Authentication endpoints' },
          { name: 'Admin', description: 'Admin panel endpoints' },
          { name: 'Products', description: 'Product management' }
        ]
      }
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true
      },
      uiHooks: {
        onRequest: async function (request, reply) {
          await requireBasicAuthSuperuser(request, reply);
        }
      },
      staticCSP: true,
      transformStaticCSP: (header) => header
    });

    // Register routes
    await fastify.register(authRoutes);
    await fastify.register(adminRoutes);
    await fastify.register(permissionsRoutes);
    await fastify.register(backupRoutes);
    await fastify.register(subscriptionRoutes);
    await fastify.register(seoRoutes);
    await fastify.register(blogRoutes);
    await fastify.register(customServiceRoutes);
    await fastify.register(customOfferRoutes);
    await fastify.register(inquiryRoutes);


    // Health check
    fastify.get('/health', {
      schema: {
        tags: ['Health'],
        description: 'Health check endpoint'
      }
    }, async (_request, reply) => {
      let dbStatus: 'ok' | 'error' = 'error';
      try {
        const db = DatabaseManager.getAdapter();
        await db.get('SELECT 1');
        dbStatus = 'ok';
      } catch {
        // db probe failed
      }

      const healthy = dbStatus === 'ok';
      reply.code(healthy ? 200 : 503).send({
        status: healthy ? 'ok' : 'degraded',
        db: dbStatus,
        timestamp: new Date().toISOString(),
      });
    });

    // Start server
    await fastify.listen({
      port: settings.port,
      host: settings.host
    });

    logger.info({
      environment: settings.environment,
      server: `http://${settings.host}:${settings.port}`,
      swagger: `http://${settings.host}:${settings.port}/docs`,
      database: settings.database.engine === 'postgresql' ? settings.database.url : settings.database.path,
    }, 'Server started');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await fastify.close();
  await DatabaseManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await fastify.close();
  await DatabaseManager.close();
  process.exit(0);
});

start();
// stripe restart trigger - manual env updated - added inquiry app

 
 
