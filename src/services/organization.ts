import { eq, and } from 'drizzle-orm';
import { Database } from '../db';
import { schema } from '../db';
import { Organization, Invitation } from '../types';
import { AppError } from '../middleware/error-handler';
import { sendInvitationEmail } from './email';

// Create a new organization
export async function createOrganization(
  db: Database,
  name: string,
  ownerId: string,
  tenantId: string,
  defaultRole: string = 'owner'
): Promise<Organization> {
  // Create organization
  const [org] = await db
    .insert(schema.organizations)
    .values({
      tenantId,
      name,
      ownerId,
      createdAt: new Date(),
    })
    .returning();

  // Add owner as first member
  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId: ownerId,
    role: defaultRole,
    joinedAt: new Date(),
  });

  return {
    id: org.id,
    tenantId: org.tenantId,
    name: org.name,
    ownerId: org.ownerId,
    subscriptionId: org.subscriptionId,
    createdAt: org.createdAt,
  };
}

// Get organization by ID
export async function getOrganization(
  db: Database,
  orgId: string,
  tenantId: string
): Promise<Organization | null> {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(
      and(
        eq(schema.organizations.id, orgId),
        eq(schema.organizations.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!org) return null;

  return {
    id: org.id,
    tenantId: org.tenantId,
    name: org.name,
    ownerId: org.ownerId,
    subscriptionId: org.subscriptionId,
    createdAt: org.createdAt,
  };
}

// Get all organizations for a user
export async function getUserOrganizations(
  db: Database,
  userId: string,
  tenantId: string
): Promise<Array<Organization & { role: string }>> {
  const memberships = await db
    .select({
      org: schema.organizations,
      role: schema.organizationMembers.role,
    })
    .from(schema.organizationMembers)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMembers.organizationId, schema.organizations.id)
    )
    .where(
      and(
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.tenantId, tenantId)
      )
    );

  return memberships.map((m) => ({
    id: m.org.id,
    tenantId: m.org.tenantId,
    name: m.org.name,
    ownerId: m.org.ownerId,
    subscriptionId: m.org.subscriptionId,
    createdAt: m.org.createdAt,
    role: m.role,
  }));
}

// Invite a member to an organization
export async function inviteMember(
  db: Database,
  orgId: string,
  email: string,
  role: string,
  invitedBy: string,
  tenantId: string,
  resendApiKey?: string // Optional: if provided, sends email
): Promise<Invitation> {
  // Verify inviter is owner
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(
      and(
        eq(schema.organizations.id, orgId),
        eq(schema.organizations.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!org) {
    throw new AppError('ORGANIZATION_NOT_FOUND', 'Organization not found', 404);
  }

  if (org.ownerId !== invitedBy) {
    throw new AppError(
      'INSUFFICIENT_PERMISSIONS',
      'Only organization owner can invite members',
      403
    );
  }

  // Create invitation
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      organizationId: orgId,
      email,
      role,
      invitedBy,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
    })
    .returning();

  // Send invitation email if Resend API key is provided
  if (resendApiKey) {
    try {
      await sendInvitationEmail(
        resendApiKey,
        email,
        org.name,
        invitation.id
      );
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      // Don't fail the invitation if email fails - invitation is still created
    }
  }

  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
    status: invitation.status as 'pending' | 'accepted' | 'rejected' | 'expired',
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  };
}

// Accept an invitation
export async function acceptInvitation(
  db: Database,
  invitationId: string,
  userId: string,
  userEmail: string
): Promise<void> {
  // Get invitation
  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, invitationId))
    .limit(1);

  if (!invitation) {
    throw new AppError('INVITATION_NOT_FOUND', 'Invitation not found', 404);
  }

  if (invitation.email !== userEmail) {
    throw new AppError(
      'INVALID_INVITATION',
      'Invitation is for a different email',
      403
    );
  }

  if (invitation.status !== 'pending') {
    throw new AppError(
      'INVALID_INVITATION',
      'Invitation has already been processed',
      400
    );
  }

  if (new Date() > invitation.expiresAt) {
    throw new AppError('INVALID_INVITATION', 'Invitation has expired', 400);
  }

  // Add user to organization
  await db.insert(schema.organizationMembers).values({
    organizationId: invitation.organizationId,
    userId,
    role: invitation.role,
    joinedAt: new Date(),
  });

  // Update invitation status
  await db
    .update(schema.invitations)
    .set({ status: 'accepted' })
    .where(eq(schema.invitations.id, invitationId));
}

// Remove a member from an organization
export async function removeMember(
  db: Database,
  orgId: string,
  userId: string,
  removerId: string,
  tenantId: string
): Promise<void> {
  // Verify remover is owner
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(
      and(
        eq(schema.organizations.id, orgId),
        eq(schema.organizations.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!org) {
    throw new AppError('ORGANIZATION_NOT_FOUND', 'Organization not found', 404);
  }

  if (org.ownerId !== removerId) {
    throw new AppError(
      'INSUFFICIENT_PERMISSIONS',
      'Only organization owner can remove members',
      403
    );
  }

  // Cannot remove owner
  if (userId === org.ownerId) {
    throw new AppError(
      'INVALID_OPERATION',
      'Cannot remove organization owner',
      400
    );
  }

  // Remove member
  await db
    .delete(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.organizationId, orgId),
        eq(schema.organizationMembers.userId, userId)
      )
    );
}
