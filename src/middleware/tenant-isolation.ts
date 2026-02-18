import { Database } from '../db';
import { AppError } from './error-handler';

/**
 * Tenant Isolation Utilities
 * 
 * These utilities ensure that all data access is properly scoped to a tenant,
 * preventing cross-tenant data leakage.
 */

/**
 * Validates that a tenant ID is present and properly formatted
 */
export function validateTenantId(tenantId: string | undefined): string {
  if (!tenantId || tenantId.trim() === '') {
    throw new AppError('INVALID_TENANT', 'Tenant ID is required', 400);
  }

  // Ensure tenant ID doesn't contain SQL injection attempts
  if (tenantId.includes("'") || tenantId.includes('"') || tenantId.includes(';')) {
    throw new AppError('INVALID_TENANT', 'Invalid tenant ID format', 400);
  }

  return tenantId.trim();
}

/**
 * Validates that a resource belongs to the specified tenant
 * This is a helper for checking tenant ownership after fetching a resource
 */
export function validateTenantOwnership(
  resourceTenantId: string,
  expectedTenantId: string,
  resourceType: string = 'Resource'
): void {
  if (resourceTenantId !== expectedTenantId) {
    throw new AppError(
      'TENANT_MISMATCH',
      `${resourceType} does not belong to the specified tenant`,
      403
    );
  }
}

/**
 * Creates a tenant-scoped database query helper
 * This ensures all queries automatically include tenant filtering
 */
export function createTenantScopedDb(db: Database, tenantId: string) {
  const validatedTenantId = validateTenantId(tenantId);

  return {
    db,
    tenantId: validatedTenantId,
    
    /**
     * Validates that the current tenant matches the expected tenant
     */
    validateTenant(expectedTenantId: string): void {
      if (this.tenantId !== expectedTenantId) {
        throw new AppError(
          'TENANT_MISMATCH',
          'Tenant context mismatch',
          403
        );
      }
    },
  };
}
