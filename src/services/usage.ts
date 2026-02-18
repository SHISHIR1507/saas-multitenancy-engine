import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { Database } from '../db';
import { schema } from '../db';
import { UsageRecord } from '../types';
import { checkLimit } from './subscription';

// Record usage for an organization
export async function recordUsage(
  db: Database,
  orgId: string,
  tenantId: string,
  metricName: string,
  quantity: number
): Promise<UsageRecord> {
  const [record] = await db
    .insert(schema.usageRecords)
    .values({
      organizationId: orgId,
      tenantId,
      metricName,
      quantity,
      timestamp: new Date(),
    })
    .returning();

  return {
    id: record.id,
    organizationId: record.organizationId,
    tenantId: record.tenantId,
    metricName: record.metricName,
    quantity: record.quantity,
    timestamp: record.timestamp,
  };
}

// Get usage for an organization within a time period
export async function getUsage(
  db: Database,
  orgId: string,
  tenantId: string,
  metricName: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ total: number; records: UsageRecord[] }> {
  let query = db
    .select()
    .from(schema.usageRecords)
    .where(
      and(
        eq(schema.usageRecords.organizationId, orgId),
        eq(schema.usageRecords.tenantId, tenantId),
        eq(schema.usageRecords.metricName, metricName)
      )
    );

  // Add date filters if provided
  const conditions = [
    eq(schema.usageRecords.organizationId, orgId),
    eq(schema.usageRecords.tenantId, tenantId),
    eq(schema.usageRecords.metricName, metricName),
  ];

  if (startDate) {
    conditions.push(gte(schema.usageRecords.timestamp, startDate));
  }

  if (endDate) {
    conditions.push(lte(schema.usageRecords.timestamp, endDate));
  }

  const records = await db
    .select()
    .from(schema.usageRecords)
    .where(and(...conditions))
    .orderBy(schema.usageRecords.timestamp);

  const total = records.reduce((sum, record) => sum + record.quantity, 0);

  return {
    total,
    records: records.map((record) => ({
      id: record.id,
      organizationId: record.organizationId,
      tenantId: record.tenantId,
      metricName: record.metricName,
      quantity: record.quantity,
      timestamp: record.timestamp,
    })),
  };
}

// Get current usage total for a metric
export async function getCurrentUsage(
  db: Database,
  orgId: string,
  tenantId: string,
  metricName: string,
  periodStart?: Date
): Promise<number> {
  const startDate = periodStart || new Date(0); // Default to beginning of time

  const result = await getUsage(db, orgId, tenantId, metricName, startDate);
  return result.total;
}

// Check if organization has exceeded usage limit
export async function checkUsageLimit(
  db: Database,
  orgId: string,
  tenantId: string,
  metricName: string,
  periodStart?: Date
): Promise<{
  withinLimit: boolean;
  limit: number;
  usage: number;
  remaining: number;
}> {
  // Get current usage
  const usage = await getCurrentUsage(db, orgId, tenantId, metricName, periodStart);

  // Check subscription limit
  const limitCheck = await checkLimit(db, orgId, metricName, usage, tenantId);

  return {
    withinLimit: limitCheck.withinLimit,
    limit: limitCheck.limit,
    usage,
    remaining: limitCheck.limit === -1 ? -1 : Math.max(0, limitCheck.limit - usage),
  };
}

// Get usage aggregated across all organizations for a tenant
export async function getAggregatedUsage(
  db: Database,
  tenantId: string,
  metricName: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  total: number;
  byOrganization: Array<{ organizationId: string; total: number }>;
}> {
  const conditions = [
    eq(schema.usageRecords.tenantId, tenantId),
    eq(schema.usageRecords.metricName, metricName),
  ];

  if (startDate) {
    conditions.push(gte(schema.usageRecords.timestamp, startDate));
  }

  if (endDate) {
    conditions.push(lte(schema.usageRecords.timestamp, endDate));
  }

  const records = await db
    .select()
    .from(schema.usageRecords)
    .where(and(...conditions));

  // Calculate total
  const total = records.reduce((sum, record) => sum + record.quantity, 0);

  // Group by organization
  const byOrg = records.reduce((acc, record) => {
    const existing = acc.find((item) => item.organizationId === record.organizationId);
    if (existing) {
      existing.total += record.quantity;
    } else {
      acc.push({
        organizationId: record.organizationId,
        total: record.quantity,
      });
    }
    return acc;
  }, [] as Array<{ organizationId: string; total: number }>);

  return {
    total,
    byOrganization: byOrg,
  };
}

// Get all usage metrics for an organization
export async function getAllUsageMetrics(
  db: Database,
  orgId: string,
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Array<{ metricName: string; total: number }>> {
  const conditions = [
    eq(schema.usageRecords.organizationId, orgId),
    eq(schema.usageRecords.tenantId, tenantId),
  ];

  if (startDate) {
    conditions.push(gte(schema.usageRecords.timestamp, startDate));
  }

  if (endDate) {
    conditions.push(lte(schema.usageRecords.timestamp, endDate));
  }

  const records = await db
    .select()
    .from(schema.usageRecords)
    .where(and(...conditions));

  // Group by metric name
  const byMetric = records.reduce((acc, record) => {
    const existing = acc.find((item) => item.metricName === record.metricName);
    if (existing) {
      existing.total += record.quantity;
    } else {
      acc.push({
        metricName: record.metricName,
        total: record.quantity,
      });
    }
    return acc;
  }, [] as Array<{ metricName: string; total: number }>);

  return byMetric;
}

// Reset usage for a metric (useful for monthly resets)
export async function resetUsage(
  db: Database,
  orgId: string,
  tenantId: string,
  metricName: string,
  beforeDate: Date
): Promise<number> {
  const result = await db
    .delete(schema.usageRecords)
    .where(
      and(
        eq(schema.usageRecords.organizationId, orgId),
        eq(schema.usageRecords.tenantId, tenantId),
        eq(schema.usageRecords.metricName, metricName),
        lte(schema.usageRecords.timestamp, beforeDate)
      )
    )
    .returning();

  return result.length;
}
