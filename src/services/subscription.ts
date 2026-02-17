import { eq, and } from 'drizzle-orm';
import { Database } from '../db';
import { schema } from '../db';
import { SubscriptionTier, Subscription } from '../types';
import { AppError } from '../middleware/error-handler';

// Create or update a subscription tier
export async function defineTier(
  db: Database,
  tenantId: string,
  name: string,
  features: string[],
  limits: Record<string, number>
): Promise<SubscriptionTier> {
  // Check if tier already exists
  const existing = await db
    .select()
    .from(schema.subscriptionTiers)
    .where(
      and(
        eq(schema.subscriptionTiers.tenantId, tenantId),
        eq(schema.subscriptionTiers.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing tier
    const [updated] = await db
      .update(schema.subscriptionTiers)
      .set({
        features,
        limits,
      })
      .where(eq(schema.subscriptionTiers.id, existing[0].id))
      .returning();

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      name: updated.name,
      features: updated.features as string[],
      limits: updated.limits as Record<string, number>,
    };
  }

  // Create new tier
  const [tier] = await db
    .insert(schema.subscriptionTiers)
    .values({
      tenantId,
      name,
      features,
      limits,
      createdAt: new Date(),
    })
    .returning();

  return {
    id: tier.id,
    tenantId: tier.tenantId,
    name: tier.name,
    features: tier.features as string[],
    limits: tier.limits as Record<string, number>,
  };
}

// Get a subscription tier by ID
export async function getTier(
  db: Database,
  tierId: string,
  tenantId: string
): Promise<SubscriptionTier | null> {
  const [tier] = await db
    .select()
    .from(schema.subscriptionTiers)
    .where(
      and(
        eq(schema.subscriptionTiers.id, tierId),
        eq(schema.subscriptionTiers.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!tier) return null;

  return {
    id: tier.id,
    tenantId: tier.tenantId,
    name: tier.name,
    features: tier.features as string[],
    limits: tier.limits as Record<string, number>,
  };
}

// Get all subscription tiers for a tenant
export async function getTiers(
  db: Database,
  tenantId: string
): Promise<SubscriptionTier[]> {
  const tiers = await db
    .select()
    .from(schema.subscriptionTiers)
    .where(eq(schema.subscriptionTiers.tenantId, tenantId));

  return tiers.map((tier) => ({
    id: tier.id,
    tenantId: tier.tenantId,
    name: tier.name,
    features: tier.features as string[],
    limits: tier.limits as Record<string, number>,
  }));
}

// Delete a subscription tier
export async function deleteTier(
  db: Database,
  tierId: string,
  tenantId: string
): Promise<void> {
  await db
    .delete(schema.subscriptionTiers)
    .where(
      and(
        eq(schema.subscriptionTiers.id, tierId),
        eq(schema.subscriptionTiers.tenantId, tenantId)
      )
    );
}

// Subscribe an organization to a tier
export async function subscribe(
  db: Database,
  orgId: string,
  tierId: string,
  tenantId: string,
  expirationDate?: Date
): Promise<Subscription> {
  // Verify tier exists
  const tier = await getTier(db, tierId, tenantId);
  if (!tier) {
    throw new AppError('TIER_NOT_FOUND', 'Subscription tier not found', 404);
  }

  // Check if organization already has a subscription
  const [existing] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId))
    .limit(1);

  if (existing) {
    // Update existing subscription
    const [updated] = await db
      .update(schema.subscriptions)
      .set({
        tierId,
        status: 'active',
        startDate: new Date(),
        expirationDate: expirationDate || null,
      })
      .where(eq(schema.subscriptions.id, existing.id))
      .returning();

    // Update organization's subscription reference
    await db
      .update(schema.organizations)
      .set({ subscriptionId: updated.id })
      .where(eq(schema.organizations.id, orgId));

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      tierId: updated.tierId,
      status: updated.status as 'active' | 'expired' | 'cancelled',
      startDate: updated.startDate,
      expirationDate: updated.expirationDate,
      features: tier.features,
      limits: tier.limits,
    };
  }

  // Create new subscription
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      organizationId: orgId,
      tierId,
      status: 'active',
      startDate: new Date(),
      expirationDate: expirationDate || null,
      createdAt: new Date(),
    })
    .returning();

  // Update organization's subscription reference
  await db
    .update(schema.organizations)
    .set({ subscriptionId: subscription.id })
    .where(eq(schema.organizations.id, orgId));

  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    tierId: subscription.tierId,
    status: subscription.status as 'active' | 'expired' | 'cancelled',
    startDate: subscription.startDate,
    expirationDate: subscription.expirationDate,
    features: tier.features,
    limits: tier.limits,
  };
}

// Update a subscription (upgrade/downgrade)
export async function updateSubscription(
  db: Database,
  subscriptionId: string,
  newTierId: string,
  tenantId: string
): Promise<Subscription> {
  // Verify new tier exists
  const tier = await getTier(db, newTierId, tenantId);
  if (!tier) {
    throw new AppError('TIER_NOT_FOUND', 'Subscription tier not found', 404);
  }

  // Update subscription
  const [updated] = await db
    .update(schema.subscriptions)
    .set({
      tierId: newTierId,
      startDate: new Date(), // Reset start date on tier change
    })
    .where(eq(schema.subscriptions.id, subscriptionId))
    .returning();

  if (!updated) {
    throw new AppError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found', 404);
  }

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    tierId: updated.tierId,
    status: updated.status as 'active' | 'expired' | 'cancelled',
    startDate: updated.startDate,
    expirationDate: updated.expirationDate,
    features: tier.features,
    limits: tier.limits,
  };
}

// Cancel a subscription
export async function cancelSubscription(
  db: Database,
  subscriptionId: string
): Promise<void> {
  const [subscription] = await db
    .update(schema.subscriptions)
    .set({ status: 'cancelled' })
    .where(eq(schema.subscriptions.id, subscriptionId))
    .returning();

  if (!subscription) {
    throw new AppError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found', 404);
  }

  // Remove subscription reference from organization
  await db
    .update(schema.organizations)
    .set({ subscriptionId: null })
    .where(eq(schema.organizations.id, subscription.organizationId));
}

// Get subscription status for an organization
export async function getSubscriptionStatus(
  db: Database,
  orgId: string,
  tenantId: string
): Promise<Subscription | null> {
  const [subscription] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId))
    .limit(1);

  if (!subscription) return null;

  // Get tier details
  const tier = await getTier(db, subscription.tierId, tenantId);
  if (!tier) return null;

  // Check if subscription is expired
  if (
    subscription.expirationDate &&
    new Date() > subscription.expirationDate &&
    subscription.status === 'active'
  ) {
    // Mark as expired
    await db
      .update(schema.subscriptions)
      .set({ status: 'expired' })
      .where(eq(schema.subscriptions.id, subscription.id));

    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      tierId: subscription.tierId,
      status: 'expired',
      startDate: subscription.startDate,
      expirationDate: subscription.expirationDate,
      features: tier.features,
      limits: tier.limits,
    };
  }

  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    tierId: subscription.tierId,
    status: subscription.status as 'active' | 'expired' | 'cancelled',
    startDate: subscription.startDate,
    expirationDate: subscription.expirationDate,
    features: tier.features,
    limits: tier.limits,
  };
}

// Check if an organization has access to a feature
export async function checkFeatureAccess(
  db: Database,
  orgId: string,
  featureName: string,
  tenantId: string
): Promise<boolean> {
  const subscription = await getSubscriptionStatus(db, orgId, tenantId);

  if (!subscription) return false;
  if (subscription.status !== 'active') return false;

  return subscription.features.includes(featureName);
}

// Check if an organization is within a usage limit
export async function checkLimit(
  db: Database,
  orgId: string,
  limitName: string,
  currentUsage: number,
  tenantId: string
): Promise<{ withinLimit: boolean; limit: number; usage: number }> {
  const subscription = await getSubscriptionStatus(db, orgId, tenantId);

  if (!subscription) {
    return { withinLimit: false, limit: 0, usage: currentUsage };
  }

  if (subscription.status !== 'active') {
    return { withinLimit: false, limit: 0, usage: currentUsage };
  }

  const limit = subscription.limits[limitName];
  if (limit === undefined) {
    // No limit defined means unlimited
    return { withinLimit: true, limit: -1, usage: currentUsage };
  }

  return {
    withinLimit: currentUsage <= limit,
    limit,
    usage: currentUsage,
  };
}
