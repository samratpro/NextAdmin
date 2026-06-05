import { FastifyInstance } from 'fastify';
import { requireSuperuser } from '../../middleware/auth';
import { User, Group, Permission, UserGroup, GroupPermission, UserPermission } from '../auth/models';
import { updateGroupIdsSchema, updatePermissionIdsSchema, parseOrReply } from './schemas';

export default async function permissionsRoutes(fastify: FastifyInstance) {
    // Get all groups
    fastify.get('/api/admin/groups', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get all groups',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const groups = await Group.objects.all<Group>().all();
        reply.send({ groups });
    });

    // Get all permissions
    fastify.get('/api/admin/permissions', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get all permissions',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const permissions = await Permission.objects.all<Permission>().all();
        reply.send({ permissions });
    });

    // Get user's groups
    fastify.get('/api/admin/users/:userId/groups', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get user groups',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const userGroups = await UserGroup.objects.filter({ userId: parseInt(userId) }).all();
        const groupIds = userGroups.map((ug: any) => ug.groupId);
        reply.send({ groupIds });
    });

    // Get user's permissions
    fastify.get('/api/admin/users/:userId/permissions', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get user permissions',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const userPermissions = await UserPermission.objects.filter({ userId: parseInt(userId) }).all();
        const permissionIds = userPermissions.map((up: any) => up.permissionId);
        reply.send({ permissionIds });
    });

    // Update user's groups
    fastify.put('/api/admin/users/:userId/groups', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Update user groups',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const bodyResult = parseOrReply(updateGroupIdsSchema, request.body);
        if (!bodyResult.success) {
            reply.code(422).send({ error: 'Invalid input', details: bodyResult.errors.flatten() });
            return;
        }
        const { groupIds } = bodyResult.data;

        // Delete existing user groups
        const existing = await UserGroup.objects.filter({ userId: parseInt(userId) }).all();
        for (const ug of existing) {
            await (ug as any).delete();
        }

        // Create new user groups
        for (const groupId of groupIds) {
            const userGroup = new UserGroup();
            (userGroup as any).userId = parseInt(userId);
            (userGroup as any).groupId = groupId;
            await userGroup.save();
        }

        reply.send({ success: true });
    });

    // Update user's permissions
    fastify.put('/api/admin/users/:userId/permissions', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Update user permissions',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const bodyResult = parseOrReply(updatePermissionIdsSchema, request.body);
        if (!bodyResult.success) {
            reply.code(422).send({ error: 'Invalid input', details: bodyResult.errors.flatten() });
            return;
        }
        const { permissionIds } = bodyResult.data;

        // Delete existing user permissions
        const existing = await UserPermission.objects.filter({ userId: parseInt(userId) }).all();
        for (const up of existing) {
            await (up as any).delete();
        }

        // Create new user permissions
        for (const permissionId of permissionIds) {
            const userPermission = new UserPermission();
            (userPermission as any).userId = parseInt(userId);
            (userPermission as any).permissionId = permissionId;
            await userPermission.save();
        }

        reply.send({ success: true });
    });

    // Get group's permissions
    fastify.get('/api/admin/groups/:groupId/permissions', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Get group permissions',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { groupId } = request.params as { groupId: string };
        const groupPermissions = await GroupPermission.objects.filter({ groupId: parseInt(groupId) }).all();
        const permissionIds = groupPermissions.map((gp: any) => gp.permissionId);
        reply.send({ permissionIds });
    });

    // Update group's permissions
    fastify.put('/api/admin/groups/:groupId/permissions', {
        preHandler: requireSuperuser,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
            tags: ['Admin'],
            description: 'Update group permissions',
            security: [{ bearerAuth: [] }]
        }
    }, async (request, reply) => {
        const { groupId } = request.params as { groupId: string };
        const bodyResult = parseOrReply(updatePermissionIdsSchema, request.body);
        if (!bodyResult.success) {
            reply.code(422).send({ error: 'Invalid input', details: bodyResult.errors.flatten() });
            return;
        }
        const { permissionIds } = bodyResult.data;

        // Delete existing group permissions
        const existing = await GroupPermission.objects.filter({ groupId: parseInt(groupId) }).all();
        for (const gp of existing) {
            await (gp as any).delete();
        }

        // Create new group permissions
        for (const permissionId of permissionIds) {
            const groupPermission = new GroupPermission();
            (groupPermission as any).groupId = parseInt(groupId);
            (groupPermission as any).permissionId = permissionId;
            await groupPermission.save();
        }

        reply.send({ success: true });
    });
}
