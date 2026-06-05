import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import authService from './service';
import permissionService from './permissionService';
import { requireAuth } from '../../middleware/auth';
import { z } from 'zod';
import settings from '../../config/settings';

const isProduction = settings.environment === 'production';

function setCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400, // 1 day
  });
  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/auth/refresh',
    maxAge: 604800, // 7 days
  });
}

function clearCookies(reply: FastifyReply) {
  reply.clearCookie('accessToken', { path: '/' });
  reply.clearCookie('refreshToken', { path: '/auth/refresh' });
}

const registerSchema = z.object({
  username: z.string().min(3).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const verifyEmailSchema = z.object({
  token: z.string()
});

const requestPasswordResetSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8)
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8)
});

const refreshTokenSchema = z.object({
  refreshToken: z.string()
});

export default async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      description: 'Register a new user',
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 150 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string' },
          lastName: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = registerSchema.parse(request.body);
      const result = await authService.register(data);

      reply.code(result.success ? 201 : 400).send(result);
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Verify Email
  fastify.post('/auth/verify-email', {
    schema: {
      tags: ['Authentication'],
      description: 'Verify email address',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token } = verifyEmailSchema.parse(request.body);
      const result = await authService.verifyEmail(token);

      reply.code(result.success ? 200 : 400).send(result);
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Login
  fastify.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      description: 'Login user',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = loginSchema.parse(request.body);
      const result = await authService.login(data);

      if (result.success && result.accessToken && result.refreshToken) {
        setCookies(reply, result.accessToken, result.refreshToken);
        // Don't expose tokens in the response body
        const { accessToken, refreshToken, ...safeResult } = result;
        reply.code(200).send(safeResult);
      } else {
        reply.code(401).send(result);
      }
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Logout
  fastify.post('/auth/logout', {
    schema: {
      tags: ['Authentication'],
      description: 'Logout and clear auth cookies',
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    clearCookies(reply);
    reply.send({ success: true, message: 'Logged out' });
  });

  // Refresh Token — accepts cookie or body (for non-browser clients)
  fastify.post('/auth/refresh', {
    schema: {
      tags: ['Authentication'],
      description: 'Refresh access token',
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tokenFromCookie = (request as any).cookies?.refreshToken;
      const body = request.body as any;
      const tokenFromBody = body?.refreshToken ? refreshTokenSchema.parse(body).refreshToken : undefined;
      const refreshToken = tokenFromCookie || tokenFromBody;

      if (!refreshToken) {
        reply.code(401).send({ success: false, message: 'No refresh token provided' });
        return;
      }

      const result = await authService.refreshAccessToken(refreshToken);

      if (result.success && result.accessToken && result.refreshToken) {
        setCookies(reply, result.accessToken, result.refreshToken);
        const { accessToken, refreshToken: _rt, ...safeResult } = result;
        reply.code(200).send(safeResult);
      } else {
        reply.code(401).send(result);
      }
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Request Password Reset
  fastify.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      description: 'Request password reset',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = requestPasswordResetSchema.parse(request.body);
      const result = await authService.requestPasswordReset(email);

      reply.code(200).send(result);
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Reset Password
  fastify.post('/auth/reset-password', {
    schema: {
      tags: ['Authentication'],
      description: 'Reset password with token',
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(request.body);
      const result = await authService.resetPassword(token, newPassword);

      reply.code(result.success ? 200 : 400).send(result);
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Change Password (Authenticated)
  fastify.post('/auth/change-password', {
    preHandler: requireAuth,
    schema: {
      tags: ['Authentication'],
      description: 'Change password (requires authentication)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
      const result = await authService.changePassword(
        request.user!.userId,
        currentPassword,
        newPassword
      );

      reply.code(result.success ? 200 : 400).send(result);
    } catch (error: any) {
      reply.code(400).send({ success: false, message: error.message });
    }
  });

  // Get Current User (Authenticated)
  fastify.get('/auth/me', {
    preHandler: requireAuth,
    schema: {
      tags: ['Authentication'],
      description: 'Get current user information',
      security: [{ bearerAuth: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const permissions = await permissionService.getUserPermissions(request.user!.userId);
    const permissionCodenames = permissions.map(p => p.codename);
    
    reply.send({ 
      user: {
        ...request.user,
        permissions: permissionCodenames
      }
    });
  });
}
