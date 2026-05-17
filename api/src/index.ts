import fs from 'fs';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
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



// Note: Explicit route and user model imports have been removed.
// We now dynamically auto-discover models and routes from src/apps/*

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

  for (const model of [...coreModels]) {
    await model.createTable();
  }

  for (const metadata of ModelRegistry.getAllModels()) {
    await metadata.model.createTable();
    await permissionService.createModelPermissions(metadata.model.name, metadata.displayName);
  }

  // Register manual permissions for non-model features
  const seoPerm = await Permission.objects.get<any>({ codename: 'seo.manage' });
  if (!seoPerm) {
    await Permission.objects.create({
      name: 'Can manage SEO settings',
      codename: 'seo.manage',
      modelName: 'SEO'
    });
  }

  logger.info('Database initialized successfully');
}

async function loadAppModels() {
  const appsDir = path.join(__dirname, 'apps');
  if (!fs.existsSync(appsDir)) return;
  const appNames = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

  for (const app of appNames) {
    const appPath = path.join(appsDir, app);
    const files = fs.readdirSync(appPath);
    const hasModelsFile = files.some(f => f === 'models.ts' || f === 'models.js');
    const hasModelsDir = files.includes('models') && fs.statSync(path.join(appPath, 'models')).isDirectory();
    
    if (hasModelsFile || hasModelsDir) {
      try {
        await import(`./apps/${app}/models`);
        logger.info(`Auto-discovered models for app: ${app}`);
      } catch (e: any) {
        if (e.code !== 'MODULE_NOT_FOUND' && e.code !== 'ERR_MODULE_NOT_FOUND') {
          logger.error(`Error loading models for app ${app}:`, e);
        }
      }
    }
  }
}

async function registerAppRoutes(fastifyInstance: any) {
  const appsDir = path.join(__dirname, 'apps');
  if (!fs.existsSync(appsDir)) return;
  const appNames = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

  for (const app of appNames) {
    const appPath = path.join(appsDir, app);
    const files = fs.readdirSync(appPath);
    for (const file of files) {
      if (file.toLowerCase().includes('routes') && (file.endsWith('.ts') || file.endsWith('.js'))) {
        try {
          const routeModule = await import(`./apps/${app}/${file}`);
          if (routeModule.default) {
            await fastifyInstance.register(routeModule.default);
            logger.info(`Auto-registered routes: ${app}/${file}`);
          }
        } catch (e: any) {
          logger.error(`Error registering routes from ${app}/${file}:`, e);
        }
      }
    }
  }
}

async function registerAppMiddlewares(fastifyInstance: any) {
  const appsDir = path.join(__dirname, 'apps');
  if (!fs.existsSync(appsDir)) return;
  const appNames = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

  for (const app of appNames) {
    const appPath = path.join(appsDir, app);
    const files = fs.readdirSync(appPath);
    for (const file of files) {
      if (file.toLowerCase().includes('middleware') && (file.endsWith('.ts') || file.endsWith('.js'))) {
        try {
          const middlewareModule = await import(`./apps/${app}/${file}`);
          if (middlewareModule.default) {
            // Calling it directly instead of fastify.register() ensures hooks apply globally
            await middlewareModule.default(fastifyInstance);
            logger.info(`Auto-registered global middleware: ${app}/${file}`);
          }
        } catch (e: any) {
          logger.error(`Error registering global middleware from ${app}/${file}:`, e);
        }
      }
    }
  }
}

async function runAppSeeders() {
  const appsDir = path.join(__dirname, 'apps');
  if (!fs.existsSync(appsDir)) return;
  const appNames = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

  for (const app of appNames) {
    const appPath = path.join(appsDir, app);
    const files = fs.readdirSync(appPath);
    const hasSeedFile = files.some(f => f === 'seed.ts' || f === 'seed.js');

    if (hasSeedFile) {
      try {
        const seedModule = await import(`./apps/${app}/seed`);
        if (seedModule.default && typeof seedModule.default === 'function') {
          logger.info(`Running auto-discovered seeder for app: ${app}`);
          await seedModule.default();
        }
      } catch (e: any) {
        logger.error(`Error running seeder for app ${app}:`, e);
      }
    }
  }
}

async function start() {
  try {
    // Dynamically discover and load models
    await loadAppModels();

    // Initialize database
    await initializeDatabase();

    // Run auto-discovered database seeders
    await runAppSeeders();

    // Initialize email service
    emailService.initialize();

    // Register Cookie support
    await fastify.register(cookie);

    // Serve static files from public/ (e.g. /uploads/seo/...)
    await fastify.register(staticFiles, {
      root: path.join(__dirname, '../public'),
      prefix: '/',
      decorateReply: false,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      }
    });

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
    await fastify.register(rateLimit, {
      max: 100, // Reduced from 500
      timeWindow: '1 minute'
    });

    // Register CORS
    await fastify.register(cors, {
      origin: settings.cors.origin,
      credentials: settings.cors.credentials
    });

    const clientHost = settings.host === '0.0.0.0' ? 'localhost' : settings.host;

    // Register Swagger
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'NextAdmin API',
          description: 'API documentation for NextAdmin',
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

    // Register all global middlewares dynamically from src/apps
    await registerAppMiddlewares(fastify);

    // Register all routes dynamically from src/apps
    await registerAppRoutes(fastify);

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
