import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  defineRole,
  getRole,
  getRoles,
  setDefaultRole,
  getDefaultRole,
  getUserRole,
  checkPermission,
  updateRolePermissions,
} from './permission';
import { createDb } from '../db';
import { schema } from '../db';

const db = createDb(process.env.DATABASE_URL!);

// Clean up database before each test
beforeEach(async () => {
  await db.delete(schema.organizationMembers);
  await db.delete(schema.invitations);
  await db.delete(schema.organizations);
  await db.delete(schema.roles);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
});

// Generators for property-based testing
const tenantIdArb = fc.string({ minLength: 5, maxLength: 20 }).map(s => `tenant_${s}`);
const roleNameArb = fc.constantFrom('owner', 'admin', 'member', 'viewer', 'developer', 'analyst');
const permissionArb = fc.constantFrom(
  'organizations.view',
  'organizations.edit',
  'organizations.members.add',
  'organizations.members.remove',
  'organizations.*',
  'usage.view',
  'usage.edit',
  'subscriptions.view',
  'subscriptions.manage',
  '*'
);
const permissionsArrayArb = fc.array(permissionArb, { minLength: 1, maxLength: 5 });

// Helper function to create a test user
async function createTestUser(tenantId: string, email: string) {
  const [user] = await db
    .insert(schema.users)
    .values({
      tenantId,
      email,
      passwordHash: 'test_hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return user;
}

// Helper function to create a test organization
async function createTestOrg(tenantId: string, ownerId: string, name: string) {
  const [org] = await db
    .insert(schema.organizations)
    .values({
      tenantId,
      name,
      ownerId,
      createdAt: new Date(),
    })
    .returning();
  return org;
}

describe('Permission Service - Role Definitions', () => {
  /**
   * Property 15: Role definition round-trip
   * **Validates: Requirements 3.1, 3.5, 9.1**
   */
  test('Property 15: Role definition round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        roleNameArb,
        permissionsArrayArb,
        async (tenantId, roleName, permissions) => {
          // Define a role
          const role = await defineRole(db, tenantId, roleName, permissions, false);

          // Verify role was created
          expect(role.tenantId).toBe(tenantId);
          expect(role.name).toBe(roleName);
          expect(role.permissions).toEqual(permissions);
          expect(role.isDefault).toBe(false);

          // Retrieve the role
          const retrieved = await getRole(db, tenantId, roleName);

          // Verify retrieved role matches
          expect(retrieved).not.toBeNull();
          expect(retrieved?.tenantId).toBe(tenantId);
          expect(retrieved?.name).toBe(roleName);
          expect(retrieved?.permissions).toEqual(permissions);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 18: Default role assignment
   * **Validates: Requirements 3.5, 9.1**
   */
  test('Property 18: Default role assignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        roleNameArb,
        permissionsArrayArb,
        async (tenantId, roleName, permissions) => {
          // Define a role
          await defineRole(db, tenantId, roleName, permissions, false);

          // Set it as default
          await setDefaultRole(db, tenantId, roleName);

          // Get default role
          const defaultRole = await getDefaultRole(db, tenantId);

          // Verify it's the correct role
          expect(defaultRole).not.toBeNull();
          expect(defaultRole?.name).toBe(roleName);
          expect(defaultRole?.isDefault).toBe(true);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Permission Service - Permission Evaluation', () => {
  /**
   * Property 16: Role assignment associates user
   * **Validates: Requirements 3.2**
   */
  test('Property 16: Role assignment associates user with organization', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Add user as member with a role
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'admin',
      joinedAt: new Date(),
    });

    // Get user's role
    const role = await getUserRole(db, user.id, org.id);

    expect(role).toBe('admin');
  });

  /**
   * Property 17: Permission evaluation correctness
   * **Validates: Requirements 3.3, 3.4**
   */
  test('Property 17: Permission evaluation correctness', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define a role with specific permissions
    await defineRole(db, tenantId, 'editor', [
      'organizations.view',
      'organizations.edit',
      'usage.view',
    ]);

    // Assign role to user
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'editor',
      joinedAt: new Date(),
    });

    // Check permissions
    const canView = await checkPermission(db, user.id, org.id, 'organizations.view', tenantId);
    const canEdit = await checkPermission(db, user.id, org.id, 'organizations.edit', tenantId);
    const canViewUsage = await checkPermission(db, user.id, org.id, 'usage.view', tenantId);
    const canDelete = await checkPermission(db, user.id, org.id, 'organizations.delete', tenantId);

    expect(canView).toBe(true);
    expect(canEdit).toBe(true);
    expect(canViewUsage).toBe(true);
    expect(canDelete).toBe(false); // Not in role permissions
  });

  /**
   * Property 19: Role permission updates propagate immediately
   * **Validates: Requirements 3.6**
   */
  test('Property 19: Role permission updates propagate immediately', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define a role with limited permissions
    await defineRole(db, tenantId, 'limited', ['organizations.view']);

    // Assign role to user
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'limited',
      joinedAt: new Date(),
    });

    // Check permission before update
    const canEditBefore = await checkPermission(db, user.id, org.id, 'organizations.edit', tenantId);
    expect(canEditBefore).toBe(false);

    // Update role permissions
    await updateRolePermissions(db, tenantId, 'limited', [
      'organizations.view',
      'organizations.edit',
    ]);

    // Check permission after update
    const canEditAfter = await checkPermission(db, user.id, org.id, 'organizations.edit', tenantId);
    expect(canEditAfter).toBe(true);
  });

  /**
   * Property 20: Wildcard permission matching
   * **Validates: Requirements 3.3**
   */
  test('Property 20: Wildcard permission matching', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Test 1: Full wildcard
    await defineRole(db, tenantId, 'superadmin', ['*']);
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'superadmin',
      joinedAt: new Date(),
    });

    const canDoAnything1 = await checkPermission(db, user.id, org.id, 'any.random.permission', tenantId);
    const canDoAnything2 = await checkPermission(db, user.id, org.id, 'organizations.delete', tenantId);
    expect(canDoAnything1).toBe(true);
    expect(canDoAnything2).toBe(true);

    // Test 2: Prefix wildcard
    const user2 = await createTestUser(tenantId, `user2_${Date.now()}@test.com`);
    await defineRole(db, tenantId, 'org_admin', ['organizations.*']);
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user2.id,
      role: 'org_admin',
      joinedAt: new Date(),
    });

    const canManageOrgs = await checkPermission(db, user2.id, org.id, 'organizations.members.add', tenantId);
    const canManageOrgs2 = await checkPermission(db, user2.id, org.id, 'organizations.delete', tenantId);
    const canManageUsage = await checkPermission(db, user2.id, org.id, 'usage.view', tenantId);

    expect(canManageOrgs).toBe(true);
    expect(canManageOrgs2).toBe(true);
    expect(canManageUsage).toBe(false); // Different prefix
  });
});

describe('Permission Service - Edge Cases', () => {
  test('User without role has no permissions', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Don't assign any role to user

    const hasPermission = await checkPermission(db, user.id, org.id, 'organizations.view', tenantId);
    expect(hasPermission).toBe(false);
  });

  test('Non-existent role returns no permissions', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Assign non-existent role
    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'nonexistent',
      joinedAt: new Date(),
    });

    const hasPermission = await checkPermission(db, user.id, org.id, 'organizations.view', tenantId);
    expect(hasPermission).toBe(false);
  });

  test('Can update role definition', async () => {
    const tenantId = `tenant_${Date.now()}`;

    // Define initial role
    await defineRole(db, tenantId, 'updatable', ['organizations.view']);

    // Update the same role
    const updated = await defineRole(db, tenantId, 'updatable', ['organizations.view', 'organizations.edit']);

    expect(updated.permissions).toHaveLength(2);
    expect(updated.permissions).toContain('organizations.view');
    expect(updated.permissions).toContain('organizations.edit');
  });

  test('Setting default role unsets previous default', async () => {
    const tenantId = `tenant_${Date.now()}`;

    // Define two roles
    await defineRole(db, tenantId, 'role1', ['perm1']);
    await defineRole(db, tenantId, 'role2', ['perm2']);

    // Set role1 as default
    await setDefaultRole(db, tenantId, 'role1');
    let defaultRole = await getDefaultRole(db, tenantId);
    expect(defaultRole?.name).toBe('role1');

    // Set role2 as default
    await setDefaultRole(db, tenantId, 'role2');
    defaultRole = await getDefaultRole(db, tenantId);
    expect(defaultRole?.name).toBe('role2');

    // Verify role1 is no longer default
    const role1 = await getRole(db, tenantId, 'role1');
    expect(role1?.isDefault).toBe(false);
  });

  test('Get all roles for tenant', async () => {
    const tenantId = `tenant_${Date.now()}`;

    // Define multiple roles
    await defineRole(db, tenantId, 'role_a', ['perm1']);
    await defineRole(db, tenantId, 'role_b', ['perm2']);
    await defineRole(db, tenantId, 'role_c', ['perm3']);

    const roles = await getRoles(db, tenantId);

    expect(roles).toHaveLength(3);
    expect(roles.map(r => r.name)).toContain('role_a');
    expect(roles.map(r => r.name)).toContain('role_b');
    expect(roles.map(r => r.name)).toContain('role_c');
  });
});
