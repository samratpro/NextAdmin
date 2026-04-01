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
    hasPermission(userId: number, codename: string): boolean {
        // Superusers have all permissions
        const user = User.objects.get<UserRecord>({ id: userId });
        if (!user) return false;
        if (user.isSuperuser) return true;

        // Check direct user permissions
        const userPerms = UserPermission.objects.filter<UserPermissionRecord>({ userId }).all();
        for (const userPerm of userPerms) {
            const permission = Permission.objects.get<PermissionRecord>({ id: userPerm.permissionId });
            if (permission && permission.codename === codename) {
                return true;
            }
        }

        // Check group permissions
        const userGroups = UserGroup.objects.filter<UserGroupRecord>({ userId }).all();
        for (const userGroup of userGroups) {
            const groupPerms = GroupPermission.objects.filter<GroupPermissionRecord>({ groupId: userGroup.groupId }).all();
            for (const groupPerm of groupPerms) {
                const permission = Permission.objects.get<PermissionRecord>({ id: groupPerm.permissionId });
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
    hasModelPermission(userId: number, action: string, modelName: string): boolean {
        const codename = `${action}_${modelName.toLowerCase()}`;
        return this.hasPermission(userId, codename);
    }

    /**
     * Get all permissions for a user
     */
    getUserPermissions(userId: number): PermissionRecord[] {
        const user = User.objects.get<UserRecord>({ id: userId });
        if (!user) return [];
        if (user.isSuperuser) {
            // Superusers have all permissions
            return Permission.objects.all<PermissionRecord>().all();
        }

        const permissions: PermissionRecord[] = [];
        const permissionIds = new Set<number>();

        // Get direct permissions
        const userPerms = UserPermission.objects.filter<UserPermissionRecord>({ userId }).all();
        for (const userPerm of userPerms) {
            permissionIds.add(userPerm.permissionId);
        }

        // Get group permissions
        const userGroups = UserGroup.objects.filter<UserGroupRecord>({ userId }).all();
        for (const userGroup of userGroups) {
            const groupPerms = GroupPermission.objects.filter<GroupPermissionRecord>({ groupId: userGroup.groupId }).all();
            for (const groupPerm of groupPerms) {
                permissionIds.add(groupPerm.permissionId);
            }
        }

        // Fetch permission objects
        for (const permId of permissionIds) {
            const perm = Permission.objects.get<PermissionRecord>({ id: permId });
            if (perm) {
                permissions.push(perm);
            }
        }

        return permissions;
    }

    /**
     * Assign a permission to a user
     */
    assignPermission(userId: number, permissionId: number): void {
        const existing = UserPermission.objects.get<any>({ userId, permissionId });
        if (!existing) {
            UserPermission.objects.create({ userId, permissionId });
        }
    }

    /**
     * Revoke a permission from a user
     */
    revokePermission(userId: number, permissionId: number): void {
        const userPerm = UserPermission.objects.get<any>({ userId, permissionId });
        if (userPerm) {
            userPerm.delete();
        }
    }

    /**
     * Assign a user to a group
     */
    assignGroup(userId: number, groupId: number): void {
        const existing = UserGroup.objects.get<any>({ userId, groupId });
        if (!existing) {
            UserGroup.objects.create({ userId, groupId });
        }
    }

    /**
     * Remove a user from a group
     */
    removeFromGroup(userId: number, groupId: number): void {
        const userGroup = UserGroup.objects.get<any>({ userId, groupId });
        if (userGroup) {
            userGroup.delete();
        }
    }

    /**
     * Create default permissions for a model
     */
    createModelPermissions(modelName: string, displayName: string): void {
        const actions = ['view', 'add', 'change', 'delete'];

        for (const action of actions) {
            const codename = `${action}_${modelName.toLowerCase()}`;
            const name = `Can ${action} ${displayName}`;

            const existing = Permission.objects.get<PermissionRecord>({ codename });
            if (!existing) {
                Permission.objects.create({
                    name,
                    codename,
                    modelName
                });
                console.log(`Created permission: ${codename}`);
            }
        }
    }
}

export default new PermissionService();
