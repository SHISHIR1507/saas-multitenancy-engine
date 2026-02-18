import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTenantId, validateTenantOwnership, createTenantScopedDb } from './tenant-isolation';
import { AppError } from './error-handler';
import { createDb } from '../db';
import { schema } from '../db';
import { register } from '../services/auth';
import { createOrganization, getOrganization, getUserOrganizations } from '../services/organization';

const db = createDb(process.env.DATABASE_URL!);

describe('Tenant Isolation - Validation', () => {
  test('validateTenantId accepts valid tenant IDs', () => {
    expect(validateTenantId('tenant_123')).toBe('tenant_123');
    expect(validateTenantId('  tenant_456  ')).toBe('tenant_456'); // Trims whitespace
  });

  test('validateTenantId rejects empty tenant IDs', () => {
    expect(() => validateTenantId('')).toThrow(AppError);
    expect(() => validateTenantId('   ')).toThrow(AppError);
    expect(() => validateTenantId(undefined as any)).toThrow(AppError);
  });

  test('validateTenantId rejects SQL injection attempts', () => {
    expect(() => validateTenantId("tenant'; DROP TABLE users;--")).toThrow(AppError);
    expect(() => validateTenantId('tenant" OR 1=1--')).toThrow(AppError);
    expect(() => validateTenantId('tenant;')).toThrow(AppError);
  });

  test('validateTenantOwnership accepts matching tenant IDs', () => {
    expect(() => validateTenantOwnership('tenant_123', 'tenant_123')).not.toThrow();
  });

  test('validateTenantOwnership rejects mismatched tenant IDs', () => {
    expect(() => validateTenantOwnership('tenant_123', 'tenant_456')).toThrow(AppError);
    expect(() => validateTenantOwnership('tenant_123', 'tenant_456', 'Organization')).toThrow('Organization does not belong');
  });

  test('createTenantScopedDb validates tenant ID', () => {
    expect(() => createTenantScopedDb(db, '')).toThrow(AppError);
    expect(() => createTenantScopedDb(db, "tenant'; DROP TABLE users;--")).toThrow(AppError);
  });

  test('createTenantScopedDb creates scoped context', () => {
    const scopedDb = createTenantScopedDb(db, 'tenant_123');
    expect(scopedDb.tenantId).toBe('tenant_123');
    expect(scopedDb.db).toBe(db);
  });

  test('Tenant scoped DB validates tenant context', () => {
    const scopedDb = createTenantScopedDb(db, 'tenant_123');
    expect(() => scopedDb.validateTenant('tenant_123')).not.toThrow();
    expect(() => scopedDb.validateTenant('tenant_456')).toThrow(AppError);
  });
});

describe('Tenant Isolation - Data Access', () => {
  /**
   * Property 35: Tenant data isolation
   * **Validates: Requirements 7.1, 7.2**
   */
  test('Property 35: Tenant data isolation', async () => {
    // Clean up before test
    await db.delete(schema.invitations);
    await db.delete(schema.organizationMembers);
    await db.delete(schema.organizations);
    await db.delete(schema.sessions);
    await db.delete(schema.users);

    // Generators for property-based testing
    const emailArb = fc.emailAddress();
    const passwordArb = fc.string({ minLength: 8, maxLength: 20 })
      .filter(p => /[a-zA-Z]/.test(p) && /[0-9]/.test(p)); // Must have letters and numbers
    const userArb = fc.record({
      email: emailArb,
      password: passwordArb,
    });

    await fc.assert(
      fc.asyncProperty(userArb, userArb, async (tenant1User, tenant2User) => {
        const tenant1Id = `tenant1_${Date.now()}_${Math.random()}`;
        const tenant2Id = `tenant2_${Date.now()}_${Math.random()}`;

        // Create users in different tenants
        const user1 = await register(
          db,
          tenant1User.email,
          tenant1User.password,
          tenant1Id,
          10,
          7 * 24 * 60 * 60 * 1000
        );

        const user2 = await register(
          db,
          tenant2User.email,
          tenant2User.password,
          tenant2Id,
          10,
          7 * 24 * 60 * 60 * 1000
        );

        // Create organization in tenant 1
        const org1 = await createOrganization(db, 'Org1', user1.user.id, tenant1Id);

        // Verify tenant 2 cannot access tenant 1's organization
        const org1FromTenant2 = await getOrganization(db, org1.id, tenant2Id);
        expect(org1FromTenant2).toBeNull(); // Should not find org from different tenant

        // Verify tenant 2 cannot see tenant 1's users' organizations
        const tenant2Orgs = await getUserOrganizations(db, user1.user.id, tenant2Id);
        expect(tenant2Orgs).toHaveLength(0); // Should not see orgs from different tenant

        // Verify tenant 1 CAN see their own organization
        const org1FromTenant1 = await getOrganization(db, org1.id, tenant1Id);
        expect(org1FromTenant1).not.toBeNull();
        expect(org1FromTenant1?.id).toBe(org1.id);

        // Verify tenant 1 CAN see their own user's organizations
        const tenant1Orgs = await getUserOrganizations(db, user1.user.id, tenant1Id);
        expect(tenant1Orgs.length).toBeGreaterThan(0);
        expect(tenant1Orgs.some(o => o.id === org1.id)).toBe(true);

        return true;
      }),
      { numRuns: 5 } // Reduced for faster tests
    );
  }, 60000); // 60 second timeout
});
