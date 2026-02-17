import { eq, and } from 'drizzle-orm';
import { Database } from '../db';
import { schema } from '../db';
import { Role } from '../types';
import { AppError } from '../middleware/error-handler';

// Create or update a role definition
export async function defineRole(
  db: Database,
  tenantId: string,
  roleName: string,
  permissions: string[],
  isDefault: boolean = false
): Promise<Role> {
  // Check if role already exists
  const [existing] = await db
    .select()
    .from(schema.roles)
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.name, roleName)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing role
    const [updated] = await db
      .update(schema.roles)
      .set({
        permissions,
        isDefault,
      })
      .where(
        and(
          eq(schema.roles.tenantId, tenantId),
          eq(schema.roles.name, roleName)
        )
      )
      .returning();

    return {
      tenantId: updated.tenantId,
      name: updated.name,
      permissions: updated.permissions as string[],
      isDefault: updated.isDefault,
    };
  }

  // Create new role
  const [role] = await db
    .insert(schema.roles)
    .values({
      tenantId,
      name: roleName,
      permissions,
      isDefault,
      createdAt: new Date(),
    })
    .returning();

  return {
    tenantId: role.tenantId,
    name: role.name,
    permissions: role.permissions as string[],
    isDefault: role.isDefault,
  };
}

// Get a role definition
export async function getRole(
  db: Database,
  tenantId: string,
  roleName: string
): Promise<Role | null> {
  const [role] = await db
    .select()
    .from(schema.roles)
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.name, roleName)
      )
    )
    .limit(1);

  if (!role) return null;

  return {
    tenantId: role.tenantId,
    name: role.name,
    permissions: role.permissions as string[],
    isDefault: role.isDefault,
  };
}

// Get all roles for a tenant
export async function getRoles(
  db: Database,
  tenantId: string
): Promise<Role[]> {
  const roles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.tenantId, tenantId));

  return roles.map((role) => ({
    tenantId: role.tenantId,
    name: role.name,
    permissions: role.permissions as string[],
    isDefault: role.isDefault,
  }));
}

// Delete a role definition
export async function deleteRole(
  db: Database,
  tenantId: string,
  roleName: string
): Promise<void> {
  await db
    .delete(schema.roles)
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.name, roleName)
      )
    );
}

// Set a role as the default role for new members
export async function setDefaultRole(
  db: Database,
  tenantId: string,
  roleName: string
): Promise<void> {
  // First, unset all default roles for this tenant
  await db
    .update(schema.roles)
    .set({ isDefault: false })
    .where(eq(schema.roles.tenantId, tenantId));

  // Then set the specified role as default
  const [role] = await db
    .update(schema.roles)
    .set({ isDefault: true })
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.name, roleName)
      )
    )
    .returning();

  if (!role) {
    throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
  }
}

// Get the default role for a tenant
export async function getDefaultRole(
  db: Database,
  tenantId: string
): Promise<Role | null> {
  const [role] = await db
    .select()
    .from(schema.roles)
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.isDefault, true)
      )
    )
    .limit(1);

  if (!role) return null;

  return {
    tenantId: role.tenantId,
    name: role.name,
    permissions: role.permissions as string[],
    isDefault: role.isDefault,
  };
}

// Get user's role in an organization
export async function getUserRole(
  db: Database,
  userId: string,
  orgId: string
): Promise<string | null> {
  const [membership] = await db
    .select()
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizationMembers.organizationId, orgId)
      )
    )
    .limit(1);

  return membership?.role || null;
}

// Check if a permission string matches a required permission
// Supports wildcards: "*" matches all, "resource.*" matches all actions on resource
function matchesPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  for (const perm of userPermissions) {
    // Wildcard matches everything
    if (perm === '*') return true;

    // Exact match
    if (perm === requiredPermission) return true;

    // Prefix wildcard match (e.g., "organizations.*" matches "organizations.members.add")
    if (perm.endsWith('.*')) {
      const prefix = perm.slice(0, -2); // Remove ".*"
      if (requiredPermission.startsWith(prefix + '.')) return true;
    }
  }

  return false;
}

// Check if a user has a specific permission in an organization
export async function checkPermission(
  db: Database,
  userId: string,
  orgId: string,
  permission: string,
  tenantId: string
): Promise<boolean> {
  // Get user's role in the organization
  const roleName = await getUserRole(db, userId, orgId);
  if (!roleName) return false;

  // Get role definition
  const role = await getRole(db, tenantId, roleName);
  if (!role) return false;

  // Check if role has the required permission
  return matchesPermission(role.permissions, permission);
}

// Update role permissions
export async function updateRolePermissions(
  db: Database,
  tenantId: string,
  roleName: string,
  permissions: string[]
): Promise<Role> {
  const [role] = await db
    .update(schema.roles)
    .set({ permissions })
    .where(
      and(
        eq(schema.roles.tenantId, tenantId),
        eq(schema.roles.name, roleName)
      )
    )
    .returning();

  if (!role) {
    throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
  }

  return {
    tenantId: role.tenantId,
    name: role.name,
    permissions: role.permissions as string[],
    isDefault: role.isDefault,
  };
}
