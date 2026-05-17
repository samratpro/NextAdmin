import { FastifyRequest, FastifyReply } from 'fastify';

import permissionService from '../apps/auth/permissionService';

/**
 * Middleware to check if user has permission for a model action
 */
export function requireModelPermission(modelName: string, action: 'view' | 'add' | 'change' | 'delete') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user;

        if (!user) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        // Superusers have all permissions
        if (user.isSuperuser) {
            return;
        }

        // Check if user has the required permission
        const hasPermission = permissionService.hasModelPermission(user.id, action, modelName);

        if (!hasPermission) {
            return reply.code(403).send({
                error: 'Forbidden',
                message: `You do not have permission to ${action} ${modelName}`
            });
        }
    };
}

/**
 * Middleware specifically for User/Group/Permission management
 * Only superusers can manage these models
 */
export function requireSuperuserForAuthModels() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).user;
        const { modelName } = request.params as { modelName?: string };

        if (!user) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        // Check if trying to access User, Group, or Permission models
        const protectedModels = ['User', 'Group', 'Permission'];
        if (modelName && protectedModels.includes(modelName)) {
            if (!user.isSuperuser) {
                return reply.code(403).send({
                    error: 'Forbidden',
                    message: 'Only superusers can manage users, groups, and permissions'
                });
            }
        }
    };
}
