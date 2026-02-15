// Core type definitions for the SaaS Backend Layer

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  token: string;
  userId: string;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  subscriptionId: string | null;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface Role {
  tenantId: string;
  name: string;
  permissions: string[];
  isDefault: boolean;
}

export interface SubscriptionTier {
  id: string;
  tenantId: string;
  name: string;
  features: string[];
  limits: Record<string, number>;
}

export interface Subscription {
  id: string;
  organizationId: string;
  tierId: string;
  status: 'active' | 'expired' | 'cancelled';
  startDate: Date;
  expirationDate: Date | null;
  features: string[];
  limits: Record<string, number>;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  tenantId: string;
  metricName: string;
  quantity: number;
  timestamp: Date;
}

export interface ApiKey {
  key: string;
  tenantId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

// Context types for request handling
export interface TenantContext {
  tenantId: string;
}

export interface UserContext extends TenantContext {
  userId: string;
  email: string;
}

// Environment bindings
export interface Env {
  // Database
  DATABASE_URL: string;
  
  // Environment variables
  JWT_SECRET: string;
  BCRYPT_WORK_FACTOR: string;
  SESSION_EXPIRATION: string;
  RATE_LIMIT_PER_MINUTE: string;
  ENVIRONMENT: string;
}

// Error types
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
  };
}
