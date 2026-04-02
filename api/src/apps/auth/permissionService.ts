import logger from '../../core/logger';
import {
    User,
    Permission,
    UserPermission,
    UserGroup,
    GroupPermission,
    UserRecord,
    PermissionRecord,
    UserPermissionRecord,
    UserGroupRecord,
    GroupPermissionRecord
} from './models';

export class PermissionService {
    /**
     * Check if a user has a specific permission
     */
    async hasPermission(userId: number, codename: string): Promise<boolean> {
        // Superusers have all permissions
        const user = await User.objects.get<UserRecord>({ id: userId });
        if (!user) return false;
        if (user.isSuperuser) return true;

        // Check direct user permissions
        const userPerms = await UserPermission.objects.filter<UserPermissionRecord>({ userId }).all();
        for (const userPerm of userPerms) {
            const permission = await Permission.objects.get<PermissionRecord>({ id: userPerm.permissionId });
            if (permission && permission.codename === codename) {
                return true;
            }
        }

        // Check group permissions
        const userGroups = await UserGroup.objects.filter<UserGroupRecord>({ userId }).all();
        for (const userGroup of userGroups) {
            const groupPerms = await GroupPermission.objects.filter<GroupPermissionRecord>({ groupId: userGroup.groupId }).all();
            for (const groupPerm of groupPerms) {
                const permission = await Permission.objects.get<PermissionRecord>({ id: groupPerm.permissionId });
                if (permission && permission.codename === codename) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if a user has permission to perform an action on a model
     */
    async hasModelPermission(userId: number, action: string, modelName: string): Promise<boolean> {
        const codename = `${action}_${modelName.toLowerCase()}`;
        return this.hasPermission(userId, codename);
    }

    /**
     * Get all permissions for a user
     */
    async getUserPermissions(userId: number): Promise<PermissionRecord[]> {
        const user = await User.objects.get<UserRecord>({ id: userId });
        if (!user) return [];
        if (user.isSuperuser) {
            // Superusers have all permissions
            return Permission.objects.all<PermissionRecord>().all();
        }

        const permissions: PermissionRecord[] = [];
        const permissionIds = new Set<number>();

        // Get direct permissions
        const userPerms = await UserPermission.objects.filter<UserPermissionRecord>({ userId }).all();
        for (const userPerm of userPerms) {
            permissionIds.add(userPerm.permissionId);
        }

        // Get group permissions
        const userGroups = await UserGroup.objects.filter<UserGroupRecord>({ userId }).all();
        for (const userGroup of userGroups) {
            const groupPerms = await GroupPermission.objects.filter<GroupPermissionRecord>({ groupId: userGroup.groupId }).all();
            for (const groupPerm of groupPerms) {
                permissionIds.add(groupPerm.permissionId);
            }
        }

        // Fetch permission objects
        for (const permId of permissionIds) {
            const perm = await Permission.objects.get<PermissionRecord>({ id: permId });
            if (perm) {
                permissions.push(perm);
            }
        }

        return permissions;
    }

    /**
     * Assign a permission to a user
     */
    async assignPermission(userId: number, permissionId: number): Promise<void> {
        const existing = await UserPermission.objects.get<any>({ userId, permissionId });
        if (!existing) {
            await UserPermission.objects.create({ userId, permissionId });
        }
    }

    /**
     * Revoke a permission from a user
     */
    async revokePermission(userId: number, permissionId: number): Promise<void> {
        const userPerm = await UserPermission.objects.get<any>({ userId, permissionId });
        if (userPerm) {
            await userPerm.delete();
        }
    }

    /**
     * Assign a user to a group
     */
    async assignGroup(userId: number, groupId: number): Promise<void> {
        const existing = await UserGroup.objects.get<any>({ userId, groupId });
        if (!existing) {
            await UserGroup.objects.create({ userId, groupId });
        }
    }

    /**
     * Remove a user from a group
     */
    async removeFromGroup(userId: number, groupId: number): Promise<void> {
        const userGroup = await UserGroup.objects.get<any>({ userId, groupId });
        if (userGroup) {
            await userGroup.delete();
        }
    }

    /**
     * Create default permissions for a model
     */
    async createModelPermissions(modelName: string, displayName: string): Promise<void> {
        const actions = ['view', 'add', 'change', 'delete'];

        for (const action of actions) {
            const codename = `${action}_${modelName.toLowerCase()}`;
            const name = `Can ${action} ${displayName}`;

            const existing = await Permission.objects.get<PermissionRecord>({ codename });
            if (!existing) {
                await Permission.objects.create({
                    name,
                    codename,
                    modelName
                });
                logger.debug({ codename }, 'Created permission');
            }
        }
    }
}

export default new PermissionService();
