import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createOrganization,
  getOrganization,
  getUserOrganizations,
  inviteMember,
  acceptInvitation,
  removeMember,
} from './organization';
import { createDb } from '../db';
import { schema } from '../db';
import { eq, and } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL!);

// Generators for property-based testing
const emailArb = fc.emailAddress();
const tenantIdArb = fc.string({ minLength: 5, maxLength: 20 }).map(s => `tenant_${s}`);
const userIdArb = fc.uuid();
const orgNameArb = fc.string({ minLength: 1, maxLength: 100 });
const roleArb = fc.constantFrom('owner', 'admin', 'member', 'viewer');

// Helper function to create a test user
async function createTestUser(tenantId: string, email: string, userId?: string) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: userId,
      tenantId,
      email,
      passwordHash: 'test_hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return user;
}

describe('Organization Service - Creation', () => {
  /**
   * Property 10: Organization creation assigns owner
   * **Validates: Requirements 2.1**
   */
  test('Property 10: Organization creation assigns owner', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        emailArb,
        orgNameArb,
        async (tenantId, email, orgName) => {
          // Create owner user
          const owner = await createTestUser(tenantId, email);

          // Create organization
          const org = await createOrganization(db, orgName, owner.id, tenantId);

          // Verify organization was created
          expect(org.id).toBeDefined();
          expect(org.ownerId).toBe(owner.id);
          expect(org.tenantId).toBe(tenantId);
          expect(org.name).toBe(orgName);

          // Verify owner is a member with 'owner' role
          const [membership] = await db
            .select()
            .from(schema.organizationMembers)
            .where(
              and(
                eq(schema.organizationMembers.organizationId, org.id),
                eq(schema.organizationMembers.userId, owner.id)
              )
            );

          expect(membership).toBeDefined();
          expect(membership.userId).toBe(owner.id);
          expect(membership.role).toBe('owner');

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Organization Service - Invitations', () => {
  /**
   * Property 11: Invitation round-trip
   * **Validates: Requirements 2.2, 2.3**
   */
  test('Property 11: Invitation round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        emailArb,
        emailArb,
        orgNameArb,
        roleArb,
        async (tenantId, ownerEmail, inviteeEmail, orgName, role) => {
          // Skip if emails are the same
          fc.pre(ownerEmail !== inviteeEmail);
          // Skip if role is owner (only one owner per org)
          fc.pre(role !== 'owner');

          // Create owner user
          const owner = await createTestUser(tenantId, ownerEmail);

          // Create invitee user
          const invitee = await createTestUser(tenantId, inviteeEmail);

          // Create organization
          const org = await createOrganization(db, orgName, owner.id, tenantId);

          // Invite member (without sending email)
          const invitation = await inviteMember(
            db,
            org.id,
            inviteeEmail,
            role,
            owner.id,
            tenantId
          );

          // Verify invitation was created
          expect(invitation.id).toBeDefined();
          expect(invitation.email).toBe(inviteeEmail);
          expect(invitation.role).toBe(role);
          expect(invitation.status).toBe('pending');

          // Accept invitation
          await acceptInvitation(db, invitation.id, invitee.id, inviteeEmail);

          // Verify membership was created
          const [membership] = await db
            .select()
            .from(schema.organizationMembers)
            .where(
              and(
                eq(schema.organizationMembers.organizationId, org.id),
                eq(schema.organizationMembers.userId, invitee.id)
              )
            );

          expect(membership).toBeDefined();
          expect(membership.organizationId).toBe(org.id);
          expect(membership.role).toBe(role);

          // Verify invitation status updated
          const [updatedInvitation] = await db
            .select()
            .from(schema.invitations)
            .where(eq(schema.invitations.id, invitation.id));

          expect(updatedInvitation.status).toBe('accepted');

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Organization Service - Member Management', () => {
  /**
   * Property 12: Member removal revokes access
   * **Validates: Requirements 2.4**
   */
  test('Property 12: Member removal revokes access', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        emailArb,
        emailArb,
        orgNameArb,
        roleArb,
        async (tenantId, ownerEmail, memberEmail, orgName, role) => {
          // Skip if emails are the same
          fc.pre(ownerEmail !== memberEmail);
          // Skip if role is owner (can't remove owner)
          fc.pre(role !== 'owner');

          // Create owner user
          const owner = await createTestUser(tenantId, ownerEmail);

          // Create member user
          const member = await createTestUser(tenantId, memberEmail);

          // Create organization
          const org = await createOrganization(db, orgName, owner.id, tenantId);

          // Add member directly
          await db.insert(schema.organizationMembers).values({
            organizationId: org.id,
            userId: member.id,
            role,
            joinedAt: new Date(),
          });

          // Verify member exists
          const membersBefore = await db
            .select()
            .from(schema.organizationMembers)
            .where(eq(schema.organizationMembers.organizationId, org.id));

          expect(membersBefore).toHaveLength(2); // owner + member

          // Remove member
          await removeMember(db, org.id, member.id, owner.id, tenantId);

          // Verify member was removed
          const membersAfter = await db
            .select()
            .from(schema.organizationMembers)
            .where(eq(schema.organizationMembers.organizationId, org.id));

          expect(membersAfter).toHaveLength(1); // only owner
          expect(membersAfter[0].userId).toBe(owner.id);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Organization Service - Queries', () => {
  /**
   * Property 13: User organization query completeness
   * **Validates: Requirements 2.5**
   */
  test('Property 13: User organization query completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        emailArb,
        fc.array(fc.tuple(orgNameArb, roleArb), { minLength: 1, maxLength: 5 }),
        async (tenantId, email, orgData) => {
          // Create user
          const user = await createTestUser(tenantId, email);

          // Create organizations and add user as member
          const createdOrgs = [];
          for (const [orgName, role] of orgData) {
            const [org] = await db
              .insert(schema.organizations)
              .values({
                tenantId,
                name: orgName,
                ownerId: user.id,
                createdAt: new Date(),
              })
              .returning();

            await db.insert(schema.organizationMembers).values({
              organizationId: org.id,
              userId: user.id,
              role,
              joinedAt: new Date(),
            });

            createdOrgs.push({ id: org.id, role });
          }

          // Query user's organizations
          const userOrgs = await getUserOrganizations(db, user.id, tenantId);

          // Verify all organizations are returned
          expect(userOrgs).toHaveLength(createdOrgs.length);

          // Verify each organization has correct role
          for (const created of createdOrgs) {
            const found = userOrgs.find((o) => o.id === created.id);
            expect(found).toBeDefined();
            expect(found?.role).toBe(created.role);
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 14: Organization context switching
   * **Validates: Requirements 2.6**
   */
  test('Property 14: Organization context switching (tenant isolation)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        tenantIdArb,
        emailArb,
        orgNameArb,
        async (tenantId1, tenantId2, email, orgName) => {
          // Skip if tenants are the same
          fc.pre(tenantId1 !== tenantId2);

          // Create user in tenant 1
          const user = await createTestUser(tenantId1, email);

          // Create organization in tenant 1
          const org1 = await createOrganization(db, orgName, user.id, tenantId1);

          // Verify we can get the organization with correct tenant
          const retrieved1 = await getOrganization(db, org1.id, tenantId1);
          expect(retrieved1).toBeDefined();
          expect(retrieved1?.id).toBe(org1.id);
          expect(retrieved1?.tenantId).toBe(tenantId1);

          // Verify we CANNOT get the organization with wrong tenant
          const retrieved2 = await getOrganization(db, org1.id, tenantId2);
          expect(retrieved2).toBeNull();

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

// Edge case tests
describe('Organization Service - Edge Cases', () => {
  test('Cannot invite member if not owner', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const owner = await createTestUser(tenantId, `owner_${Date.now()}@test.com`);
    const nonOwner = await createTestUser(tenantId, `nonowner_${Date.now()}@test.com`);
    const inviteeEmail = `invitee_${Date.now()}@test.com`;

    const org = await createOrganization(db, 'Test Org', owner.id, tenantId);

    // Non-owner tries to invite
    await expect(
      inviteMember(db, org.id, inviteeEmail, 'member', nonOwner.id, tenantId)
    ).rejects.toThrow('INSUFFICIENT_PERMISSIONS');
  });

  test('Cannot remove organization owner', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const owner = await createTestUser(tenantId, `owner_${Date.now()}@test.com`);

    const org = await createOrganization(db, 'Test Org', owner.id, tenantId);

    // Try to remove owner
    await expect(
      removeMember(db, org.id, owner.id, owner.id, tenantId)
    ).rejects.toThrow('INVALID_OPERATION');
  });

  test('Cannot accept invitation with wrong email', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const owner = await createTestUser(tenantId, `owner_${Date.now()}@test.com`);
    const inviteeEmail = `invitee_${Date.now()}@test.com`;
    const wrongUser = await createTestUser(tenantId, `wrong_${Date.now()}@test.com`);

    const org = await createOrganization(db, 'Test Org', owner.id, tenantId);
    const invitation = await inviteMember(db, org.id, inviteeEmail, 'member', owner.id, tenantId);

    // Try to accept with wrong email
    await expect(
      acceptInvitation(db, invitation.id, wrongUser.id, wrongUser.email)
    ).rejects.toThrow('INVALID_INVITATION');
  });

  test('Cannot accept expired invitation', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const owner = await createTestUser(tenantId, `owner_${Date.now()}@test.com`);
    const inviteeEmail = `invitee_${Date.now()}@test.com`;
    const invitee = await createTestUser(tenantId, inviteeEmail);

    const org = await createOrganization(db, 'Test Org', owner.id, tenantId);

    // Create expired invitation manually
    const [invitation] = await db
      .insert(schema.invitations)
      .values({
        organizationId: org.id,
        email: inviteeEmail,
        role: 'member',
        invitedBy: owner.id,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      })
      .returning();

    // Try to accept expired invitation
    await expect(
      acceptInvitation(db, invitation.id, invitee.id, inviteeEmail)
    ).rejects.toThrow('INVALID_INVITATION');
  });
});
