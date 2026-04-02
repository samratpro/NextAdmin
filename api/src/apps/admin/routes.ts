import { FastifyInstance } from 'fastify';
import { requireStaff, requireSuperuser } from '../../middleware/auth';
import { ModelRegistry } from '../../core/ModelRegistry';
import { User } from '../auth/models';
import permissionService from '../auth/permissionService';
import {
  paginationQuerySchema,
  modelNameParamSchema,
  idParamSchema,
  createUserSchema,
  updateUserSchema,
  parseOrReply,
} from './schemas';

// Helper function to check if model requires superuser access
function isProtectedAuthModel(modelName: string): boolean {
    return ['User', 'Group', 'Permission'].includes(modelName);
}

export default async function adminRoutes(fastify: FastifyInstance) {
    // Get all registered models
    fastify.get('/api/admin/models', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get all registered models',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const models = ModelRegistry.getAllModels();

        // Filter models based on user permissions
        const accessibleModels = [];

        for (const model of models) {
            const modelName = model.model.name;

            // For superusers, show all models
            if (request.user?.isSuperuser) {
                accessibleModels.push({
                    name: modelName,
                    tableName: model.tableName,
                    appName: model.appName,
                    displayName: model.displayName,
                    icon: model.icon,
                    permissions: model.permissions
                });
                continue;
            }

            // Check if user has ANY permission for this model (view, add, change, delete)
            const actions = ['view', 'add', 'change', 'delete'];
            let hasPermission = false;

            for (const action of actions) {
                if (await permissionService.hasModelPermission(request.user!.userId, action, modelName)) {
                    hasPermission = true;
                    break;
                }
            }

            if (hasPermission) {
                accessibleModels.push({
                    name: modelName,
                    tableName: model.tableName,
                    appName: model.appName,
                    displayName: model.displayName,
                    icon: model.icon,
                    permissions: model.permissions
                });
            }
        }

        reply.send({ models: accessibleModels });
    });

    // Get model metadata
    fastify.get('/api/admin/models/:modelName', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get model metadata',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { modelName } = request.params as { modelName: string };
        const metadata = ModelRegistry.getModel(modelName);

        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check if user has permission to access this model
        if (!request.user?.isSuperuser) {
            // Check if user has ANY permission for this model
            const actions = ['view', 'add', 'change', 'delete'];
            let hasPermission = false;
            for (const action of actions) {
                if (await permissionService.hasModelPermission(request.user!.userId, action, modelName)) {
                    hasPermission = true;
                    break;
                }
            }

            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        reply.send({ metadata });
    });

    // List model instances with pagination
    fastify.get('/api/admin/models/:modelName/data', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get model instances',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const paramResult = parseOrReply(modelNameParamSchema, request.params);
        if (!paramResult.success) {
            reply.code(422).send({ error: 'Invalid params', details: paramResult.errors.flatten() });
            return;
        }
        const queryResult = parseOrReply(paginationQuerySchema, request.query);
        if (!queryResult.success) {
            reply.code(422).send({ error: 'Invalid query', details: queryResult.errors.flatten() });
            return;
        }
        const { modelName } = paramResult.data;
        const { page, limit, orderBy = 'id', orderDirection = 'DESC' } = queryResult.data;

        const metadata = ModelRegistry.getModel(modelName);
        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check permission
        if (!request.user?.isSuperuser) {
            // Require 'view' permission to list data
            const hasPermission = await permissionService.hasModelPermission(
                request.user!.userId,
                'view',
                modelName
            );
            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        let query = metadata.model.objects.all<any>();

        // Apply ordering
        query = query.orderBy(orderBy, orderDirection as 'ASC' | 'DESC');

        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.offset(offset).limit(limit);

        const instances = await query.all();
        const total = await metadata.model.objects.count();

        // Filter excluded fields (security)
        const excluded = metadata.adminOptions.excludeFields || [];
        const safeInstances = instances.map(instance => {
            const data = (instance as any).toJSON ? (instance as any).toJSON() : { ...instance };
            for (const key of excluded) {
                delete data[key];
            }
            return data;
        });

        reply.send({
            data: safeInstances,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    });

    // Get single model instance
    fastify.get('/api/admin/models/:modelName/data/:id', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get single model instance',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { modelName, id } = request.params as { modelName: string; id: string };

        const metadata = ModelRegistry.getModel(modelName);
        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check permission
        if (!request.user?.isSuperuser) {
            const hasPermission = await permissionService.hasModelPermission(
                request.user!.userId,
                'view',
                modelName
            );
            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        const instance = await metadata.model.objects.get<any>({ id: parseInt(id) });
        if (!instance) {
            reply.code(404).send({ error: 'Instance not found' });
            return;
        }

        const data = instance.toJSON();
        const excluded = metadata.adminOptions.excludeFields || [];
        for (const key of excluded) {
            delete data[key];
        }
        reply.send({ data });
    });

    // Create model instance
    fastify.post('/api/admin/models/:modelName/data', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Create model instance',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { modelName } = request.params as { modelName: string };

        const metadata = ModelRegistry.getModel(modelName);
        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check permission
        if (!request.user?.isSuperuser) {
            const hasPermission = await permissionService.hasModelPermission(
                request.user!.userId,
                'add',
                modelName
            );
            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        const body = request.body as any;

        // Handle password hashing if supported
        const instance = new metadata.model();
        if (body.password && typeof (instance as any).setPassword === 'function') {
            await (instance as any).setPassword(body.password);
            delete body.password; // Don't overwrite hash with plain text
        } else if (body.password === '' || body.password === undefined) {
            delete body.password; // Ignore empty password updates
        }

        Object.assign(instance, body);
        await instance.save();
        reply.code(201).send({ data: instance });
    });

    // Update model instance
    fastify.put('/api/admin/models/:modelName/data/:id', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Update model instance',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { modelName, id } = request.params as { modelName: string; id: string };

        const metadata = ModelRegistry.getModel(modelName);
        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check permission
        if (!request.user?.isSuperuser) {
            const hasPermission = await permissionService.hasModelPermission(
                request.user!.userId,
                'change',
                modelName
            );
            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        const instance = await metadata.model.objects.get<any>({ id: parseInt(id) });
        if (!instance) {
            reply.code(404).send({ error: 'Instance not found' });
            return;
        }

        const body = request.body as any;

        // Handle password hashing if supported
        if (body.password && typeof (instance as any).setPassword === 'function') {
            await (instance as any).setPassword(body.password);
            delete body.password; // Don't overwrite hash with plain text
        } else if (body.password === '' || body.password === undefined) {
            delete body.password; // Ignore empty password updates
        }

        Object.assign(instance, body);
        await instance.save();

        reply.send({ data: instance });
    });

    // Delete model instance
    fastify.delete('/api/admin/models/:modelName/data/:id', {
        preHandler: requireStaff,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Delete model instance',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { modelName, id } = request.params as { modelName: string; id: string };

        const metadata = ModelRegistry.getModel(modelName);
        if (!metadata) {
            reply.code(404).send({ error: 'Model not found' });
            return;
        }

        // Check permission
        if (!request.user?.isSuperuser) {
            const hasPermission = await permissionService.hasModelPermission(
                request.user!.userId,
                'delete',
                modelName
            );
            if (!hasPermission) {
                reply.code(403).send({ error: 'Permission denied' });
                return;
            }
        }

        const instance = await metadata.model.objects.get<any>({ id: parseInt(id) });
        if (!instance) {
            reply.code(404).send({ error: 'Instance not found' });
            return;
        }

        await instance.delete();
        reply.code(204).send();
    });

    // User management endpoints
    fastify.get('/api/admin/users', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get all users',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { page = 1, limit = 20 } = request.query as any;

        const offset = (page - 1) * limit;
        const users = await User.objects.all<User>()
            .orderBy('id', 'DESC')
            .offset(offset)
            .limit(limit)
            .all();

        const total = await User.objects.count();

        // Remove sensitive data
        const safeUsers = users.map(u => ({
            id: u.id,
            username: (u as any).username,
            email: (u as any).email,
            firstName: (u as any).firstName,
            lastName: (u as any).lastName,
            isActive: (u as any).isActive,
            isStaff: (u as any).isStaff,
            isSuperuser: (u as any).isSuperuser,
            dateJoined: (u as any).dateJoined,
            lastLogin: (u as any).lastLogin
        }));

        reply.send({
            users: safeUsers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    });

    // Create user
    fastify.post('/api/admin/users', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Create a new user',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const bodyResult = parseOrReply(createUserSchema, request.body);
        if (!bodyResult.success) {
            reply.code(422).send({ error: 'Invalid input', details: bodyResult.errors.flatten() });
            return;
        }
        const { username, email, password, firstName, lastName, isActive, isStaff, isSuperuser } = bodyResult.data;

        const user = new User();
        (user as any).username = username;
        (user as any).email = email;
        (user as any).firstName = firstName || '';
        (user as any).lastName = lastName || '';
        (user as any).isActive = isActive !== undefined ? isActive : true;
        (user as any).isStaff = isStaff || false;
        (user as any).isSuperuser = isSuperuser || false;

        await user.setPassword(password);
        await user.save();

        reply.code(201).send({
            user: {
                id: user.id,
                username: (user as any).username,
                email: (user as any).email,
                isStaff: (user as any).isStaff,
                isSuperuser: (user as any).isSuperuser
            }
        });
    });

    // Update user (including role changes)
    fastify.put('/api/admin/users/:id', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Update user',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const paramResult = parseOrReply(idParamSchema, request.params);
        if (!paramResult.success) {
            reply.code(422).send({ error: 'Invalid params', details: paramResult.errors.flatten() });
            return;
        }
        const bodyResult = parseOrReply(updateUserSchema, request.body);
        if (!bodyResult.success) {
            reply.code(422).send({ error: 'Invalid input', details: bodyResult.errors.flatten() });
            return;
        }
        const updates = bodyResult.data;

        const user = await User.objects.get<User>({ id: paramResult.data.id });
        if (!user) {
            reply.code(404).send({ error: 'User not found' });
            return;
        }

        // Update fields
        if (updates.username) (user as any).username = updates.username;
        if (updates.email) (user as any).email = updates.email;
        if (updates.firstName !== undefined) (user as any).firstName = updates.firstName;
        if (updates.lastName !== undefined) (user as any).lastName = updates.lastName;
        if (updates.isActive !== undefined) (user as any).isActive = updates.isActive;
        if (updates.isStaff !== undefined) (user as any).isStaff = updates.isStaff;
        if (updates.isSuperuser !== undefined) (user as any).isSuperuser = updates.isSuperuser;

        if (updates.password) {
            await user.setPassword(updates.password);
        }

        await user.save();

        reply.send({ user });
    });

    // Assign permission to user
    fastify.post('/api/admin/users/:id/permissions/:permissionId', {
        preHandler: requireSuperuser,
        schema: {
            tags: ['Admin'],
            description: 'Assign permission to user',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { id, permissionId } = request.params as { id: string; permissionId: string };

        await permissionService.assignPermission(parseInt(id), parseInt(permissionId));

        reply.send({ success: true });
    });

    // Revoke permission from user
    fastify.delete('/api/admin/users/:id/permissions/:permissionId', {
        preHandler: requireSuperuser,
        schema: {
            tags: ['Admin'],
            description: 'Revoke permission from user',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { id, permissionId } = request.params as { id: string; permissionId: string };

        await permissionService.revokePermission(parseInt(id), parseInt(permissionId));

        reply.send({ success: true });
    });
}
