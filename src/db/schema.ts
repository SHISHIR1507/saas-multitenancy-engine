import { pgTable, text, timestamp, uuid, boolean, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailTenantIdx: uniqueIndex('users_email_tenant_idx').on(table.email, table.tenantId),
  tenantIdx: index('users_tenant_idx').on(table.tenantId),
}));

// Sessions table
export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  userIdx: index('sessions_user_idx').on(table.userId),
  tenantIdx: index('sessions_tenant_idx').on(table.tenantId),
}));

// Organizations table
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('organizations_tenant_idx').on(table.tenantId),
  ownerIdx: index('organizations_owner_idx').on(table.ownerId),
}));

// Organization members table
export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => ({
  orgUserIdx: uniqueIndex('org_members_org_user_idx').on(table.organizationId, table.userId),
  userIdx: index('org_members_user_idx').on(table.userId),
}));

// Invitations table
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending, accepted, rejected, expired
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  orgIdx: index('invitations_org_idx').on(table.organizationId),
  emailIdx: index('invitations_email_idx').on(table.email),
}));

// Roles table
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').notNull().$type<string[]>(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantNameIdx: uniqueIndex('roles_tenant_name_idx').on(table.tenantId, table.name),
  tenantIdx: index('roles_tenant_idx').on(table.tenantId),
}));

// Subscription tiers table
export const subscriptionTiers = pgTable('subscription_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  features: jsonb('features').notNull().$type<string[]>(),
  limits: jsonb('limits').notNull().$type<Record<string, number>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('subscription_tiers_tenant_idx').on(table.tenantId),
}));

// Subscriptions table
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').notNull().references(() => subscriptionTiers.id),
  status: text('status').notNull().default('active'), // active, expired, cancelled
  startDate: timestamp('start_date').defaultNow().notNull(),
  expirationDate: timestamp('expiration_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: uniqueIndex('subscriptions_org_idx').on(table.organizationId),
}));

// Usage records table
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull(),
  metricName: text('metric_name').notNull(),
  quantity: integer('quantity').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  orgMetricIdx: index('usage_records_org_metric_idx').on(table.organizationId, table.metricName),
  timestampIdx: index('usage_records_timestamp_idx').on(table.timestamp),
  tenantIdx: index('usage_records_tenant_idx').on(table.tenantId),
}));

// API keys table
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyHash: text('key_hash').notNull().unique(),
  tenantId: text('tenant_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
}, (table) => ({
  tenantIdx: index('api_keys_tenant_idx').on(table.tenantId),
}));
