import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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

const fastify = Fastify({
  logger: {
    level: settings.debug ? 'info' : 'warn'
  }
});

async function initializeDatabase() {
  console.log('Initializing database...');
  DatabaseManager.initialize(settings.database.path);

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

  for (const model of coreModels) {
    model.createTable();
  }

  for (const metadata of ModelRegistry.getAllModels()) {
    metadata.model.createTable();
    permissionService.createModelPermissions(metadata.model.name, metadata.displayName);
  }

  console.log('Database initialized successfully');
}

async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    // Initialize email service
    emailService.initialize();

    // Register Security Headers
    await fastify.register(helmet, { contentSecurityPolicy: false });

    // Register Rate Limiting
    await fastify.register(rateLimit, {
      max: 500,
      timeWindow: '1 minute'
    });

    // Register CORS
    await fastify.register(cors, {
      origin: settings.cors.origin,
      credentials: settings.cors.credentials
    });

    // Register Swagger
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Django-like Framework API',
          description: 'API documentation for Django-like framework built with Fastify',
          version: '1.0.0'
        },
        servers: [
          {
            url: `http://${settings.host}:${settings.port}`,
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

    // Health check
    fastify.get('/health', {
      schema: {
        tags: ['Health'],
        description: 'Health check endpoint'
      }
    }, async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Start server
    await fastify.listen({
      port: settings.port,
      host: settings.host
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 Django-like Framework Server Started                    ║
║                                                               ║
║   Environment: ${settings.environment.padEnd(43)}║
║   Server:      http://${settings.host}:${settings.port}${' '.repeat(35 - settings.host.length - settings.port.toString().length)}║
║   Swagger UI:  http://${settings.host}:${settings.port}/docs${' '.repeat(30 - settings.host.length - settings.port.toString().length)}║
║   Database:    ${settings.database.path.padEnd(43)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await fastify.close();
  DatabaseManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await fastify.close();
  DatabaseManager.close();
  process.exit(0);
});

start();
