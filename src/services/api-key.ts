import { eq } from 'drizzle-orm';
import { Database } from '../db';
import { schema } from '../db';
import { TenantContext } from '../types';
import { AppError } from '../middleware/error-handler';
import * as crypto from 'crypto';

// Generate a new API key
export function generateApiKey(): string {
  // Format: sk_live_<random_32_chars>
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes.toString('base64url');
  return `sk_live_${randomString}`;
}

// Hash API key for storage (using SHA-256)
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Create a new API key for a tenant
export async function createApiKey(
  db: Database,
  tenantId: string,
  name: string
): Promise<{ apiKey: string; keyHash: string }> {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  await db.insert(schema.apiKeys).values({
    keyHash,
    tenantId,
    name,
    createdAt: new Date(),
  });

  return { apiKey, keyHash };
}

// Validate API key and return tenant context
export async function validateApiKey(
  db: Database,
  apiKey: string
): Promise<TenantContext> {
  if (!apiKey || !apiKey.startsWith('sk_')) {
    throw new AppError('INVALID_API_KEY', 'Invalid API key format', 401);
  }

  const keyHash = hashApiKey(apiKey);

  const [apiKeyRecord] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!apiKeyRecord) {
    throw new AppError('INVALID_API_KEY', 'API key not found', 401);
  }

  // Update last used timestamp
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.keyHash, keyHash));

  return {
    tenantId: apiKeyRecord.tenantId,
  };
}
