import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  defineTier,
  getTier,
  getTiers,
  subscribe,
  updateSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  checkFeatureAccess,
  checkLimit,
} from './subscription';
import { createDb } from '../db';
import { schema } from '../db';

const db = createDb(process.env.DATABASE_URL!);

// Clean up database before each test
beforeEach(async () => {
  await db.delete(schema.subscriptions);
  await db.delete(schema.subscriptionTiers);
  await db.delete(schema.organizationMembers);
  await db.delete(schema.organizations);
  await db.delete(schema.users);
});

// Generators for property-based testing
const tenantIdArb = fc.string({ minLength: 5, maxLength: 20 }).map(s => `tenant_${s}`);
const tierNameArb = fc.constantFrom('free', 'pro', 'enterprise', 'starter', 'business');
const featureArb = fc.constantFrom(
  'api_access',
  'advanced_analytics',
  'priority_support',
  'custom_branding',
  'sso',
  'webhooks'
);
const featuresArrayArb = fc.array(featureArb, { minLength: 1, maxLength: 4 });
const limitsArb = fc.record({
  api_calls: fc.integer({ min: 100, max: 100000 }),
  users: fc.integer({ min: 1, max: 1000 }),
  storage_gb: fc.integer({ min: 1, max: 1000 }),
}).map(obj => ({ ...obj })); // Convert to plain object

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

describe('Subscription Service - Tier Management', () => {
  /**
   * Property 21: Subscription tier definition round-trip
   * **Validates: Requirements 4.1, 9.2**
   */
  test('Property 21: Subscription tier definition round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        tierNameArb,
        featuresArrayArb,
        limitsArb,
        async (tenantId, tierName, features, limits) => {
          // Define a tier
          const tier = await defineTier(db, tenantId, tierName, features, limits);

          // Verify tier was created
          expect(tier.id).toBeDefined();
          expect(tier.tenantId).toBe(tenantId);
          expect(tier.name).toBe(tierName);
          expect(tier.features).toEqual(features);
          expect(tier.limits).toEqual(limits);

          // Retrieve the tier
          const retrieved = await getTier(db, tier.id, tenantId);

          // Verify retrieved tier matches
          expect(retrieved).not.toBeNull();
          expect(retrieved?.id).toBe(tier.id);
          expect(retrieved?.name).toBe(tierName);
          expect(retrieved?.features).toEqual(features);
          expect(retrieved?.limits).toEqual(limits);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('Subscription Service - Subscription Lifecycle', () => {
  /**
   * Property 22: Subscription activates features
   * **Validates: Requirements 4.2**
   */
  test('Property 22: Subscription activates features', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define a tier with specific features
    const tier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access', 'advanced_analytics', 'priority_support'],
      { api_calls: 10000, users: 50 }
    );

    // Subscribe organization to tier
    const subscription = await subscribe(db, org.id, tier.id, tenantId);

    // Verify subscription is active
    expect(subscription.status).toBe('active');
    expect(subscription.features).toEqual(tier.features);
    expect(subscription.limits).toEqual(tier.limits);

    // Verify feature access
    const hasApiAccess = await checkFeatureAccess(db, org.id, 'api_access', tenantId);
    const hasAnalytics = await checkFeatureAccess(db, org.id, 'advanced_analytics', tenantId);
    const hasSSO = await checkFeatureAccess(db, org.id, 'sso', tenantId);

    expect(hasApiAccess).toBe(true);
    expect(hasAnalytics).toBe(true);
    expect(hasSSO).toBe(false); // Not in tier features
  });

  /**
   * Property 23: Subscription changes update features
   * **Validates: Requirements 4.3**
   */
  test('Property 23: Subscription changes update features', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define two tiers
    const basicTier = await defineTier(
      db,
      tenantId,
      'basic',
      ['api_access'],
      { api_calls: 1000 }
    );

    const proTier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access', 'advanced_analytics', 'priority_support'],
      { api_calls: 10000 }
    );

    // Subscribe to basic tier
    const subscription = await subscribe(db, org.id, basicTier.id, tenantId);
    expect(subscription.features).toHaveLength(1);

    // Check feature access before upgrade
    const hasAnalyticsBefore = await checkFeatureAccess(db, org.id, 'advanced_analytics', tenantId);
    expect(hasAnalyticsBefore).toBe(false);

    // Upgrade to pro tier
    const upgraded = await updateSubscription(db, subscription.id, proTier.id, tenantId);
    expect(upgraded.features).toHaveLength(3);
    expect(upgraded.limits.api_calls).toBe(10000);

    // Check feature access after upgrade
    const hasAnalyticsAfter = await checkFeatureAccess(db, org.id, 'advanced_analytics', tenantId);
    expect(hasAnalyticsAfter).toBe(true);
  });

  /**
   * Property 24: Expired subscriptions restrict access
   * **Validates: Requirements 4.4**
   */
  test('Property 24: Expired subscriptions restrict access', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define a tier
    const tier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access', 'advanced_analytics'],
      { api_calls: 10000 }
    );

    // Subscribe with expiration date in the past
    const expiredDate = new Date(Date.now() - 1000); // 1 second ago
    await subscribe(db, org.id, tier.id, tenantId, expiredDate);

    // Get subscription status (should auto-mark as expired)
    const status = await getSubscriptionStatus(db, org.id, tenantId);
    expect(status?.status).toBe('expired');

    // Verify feature access is denied
    const hasAccess = await checkFeatureAccess(db, org.id, 'api_access', tenantId);
    expect(hasAccess).toBe(false);
  });

  /**
   * Property 25: Subscription status query accuracy
   * **Validates: Requirements 4.5**
   */
  test('Property 25: Subscription status query accuracy', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // No subscription initially
    const noSub = await getSubscriptionStatus(db, org.id, tenantId);
    expect(noSub).toBeNull();

    // Define and subscribe
    const tier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access'],
      { api_calls: 10000 }
    );
    const subscription = await subscribe(db, org.id, tier.id, tenantId);

    // Get status
    const status = await getSubscriptionStatus(db, org.id, tenantId);
    expect(status).not.toBeNull();
    expect(status?.id).toBe(subscription.id);
    expect(status?.status).toBe('active');
    expect(status?.features).toEqual(tier.features);
    expect(status?.limits).toEqual(tier.limits);

    // Cancel subscription
    await cancelSubscription(db, subscription.id);

    // Get status after cancellation
    const cancelledStatus = await getSubscriptionStatus(db, org.id, tenantId);
    expect(cancelledStatus?.status).toBe('cancelled');
  });
});

describe('Subscription Service - Usage Limits', () => {
  test('Check usage limits', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define tier with limits
    const tier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access'],
      { api_calls: 1000, users: 10 }
    );

    await subscribe(db, org.id, tier.id, tenantId);

    // Check within limit
    const withinLimit = await checkLimit(db, org.id, 'api_calls', 500, tenantId);
    expect(withinLimit.withinLimit).toBe(true);
    expect(withinLimit.limit).toBe(1000);
    expect(withinLimit.usage).toBe(500);

    // Check at limit
    const atLimit = await checkLimit(db, org.id, 'api_calls', 1000, tenantId);
    expect(atLimit.withinLimit).toBe(true);

    // Check over limit
    const overLimit = await checkLimit(db, org.id, 'api_calls', 1500, tenantId);
    expect(overLimit.withinLimit).toBe(false);
    expect(overLimit.limit).toBe(1000);
    expect(overLimit.usage).toBe(1500);
  });

  test('Undefined limit means unlimited', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    // Define tier without storage limit
    const tier = await defineTier(
      db,
      tenantId,
      'enterprise',
      ['api_access'],
      { api_calls: 100000 } // No storage_gb limit
    );

    await subscribe(db, org.id, tier.id, tenantId);

    // Check undefined limit (should be unlimited)
    const result = await checkLimit(db, org.id, 'storage_gb', 999999, tenantId);
    expect(result.withinLimit).toBe(true);
    expect(result.limit).toBe(-1); // -1 indicates unlimited
  });
});

describe('Subscription Service - Edge Cases', () => {
  test('Can update tier definition', async () => {
    const tenantId = `tenant_${Date.now()}`;

    // Define initial tier
    const tier = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access'],
      { api_calls: 1000 }
    );

    // Update the same tier
    const updated = await defineTier(
      db,
      tenantId,
      'pro',
      ['api_access', 'advanced_analytics'],
      { api_calls: 5000 }
    );

    expect(updated.id).toBe(tier.id); // Same tier
    expect(updated.features).toHaveLength(2);
    expect(updated.limits.api_calls).toBe(5000);
  });

  test('Get all tiers for tenant', async () => {
    const tenantId = `tenant_${Date.now()}`;

    // Define multiple tiers
    await defineTier(db, tenantId, 'free', ['api_access'], { api_calls: 100 });
    await defineTier(db, tenantId, 'pro', ['api_access', 'analytics'], { api_calls: 10000 });
    await defineTier(db, tenantId, 'enterprise', ['api_access', 'analytics', 'sso'], { api_calls: 100000 });

    const tiers = await getTiers(db, tenantId);

    expect(tiers).toHaveLength(3);
    expect(tiers.map(t => t.name)).toContain('free');
    expect(tiers.map(t => t.name)).toContain('pro');
    expect(tiers.map(t => t.name)).toContain('enterprise');
  });

  test('Subscribing twice updates existing subscription', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    const tier1 = await defineTier(db, tenantId, 'basic', ['api_access'], { api_calls: 1000 });
    const tier2 = await defineTier(db, tenantId, 'pro', ['api_access', 'analytics'], { api_calls: 10000 });

    // First subscription
    const sub1 = await subscribe(db, org.id, tier1.id, tenantId);

    // Second subscription (should update, not create new)
    const sub2 = await subscribe(db, org.id, tier2.id, tenantId);

    expect(sub2.id).toBe(sub1.id); // Same subscription ID
    expect(sub2.tierId).toBe(tier2.id); // Updated tier
  });

  test('Cannot subscribe to non-existent tier', async () => {
    const tenantId = `tenant_${Date.now()}`;
    const user = await createTestUser(tenantId, `user_${Date.now()}@test.com`);
    const org = await createTestOrg(tenantId, user.id, 'Test Org');

    await expect(
      subscribe(db, org.id, 'fake-tier-id', tenantId)
    ).rejects.toThrow();
  });
});
