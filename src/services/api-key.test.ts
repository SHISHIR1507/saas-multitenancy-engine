import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { generateApiKey, hashApiKey, createApiKey, validateApiKey } from './api-key';
import { createDb } from '../db';
import { AppError } from '../middleware/error-handler';

// Mock database for testing
const db = createDb(process.env.DATABASE_URL!);

describe('API Key Service', () => {
  // Property 31: API key generation
  test('Property 31: Generated API keys have correct format', () => {
    // Feature: saas-backend-layer, Property 31: API key generation
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (iterations) => {
        const apiKey = generateApiKey();
        
        // Should start with sk_live_
        expect(apiKey).toMatch(/^sk_live_/);
        
        // Should have sufficient length (prefix + random part)
        expect(apiKey.length).toBeGreaterThan(20);
        
        // Should only contain valid base64url characters
        const randomPart = apiKey.replace('sk_live_', '');
        expect(randomPart).toMatch(/^[A-Za-z0-9_-]+$/);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property 31: API keys are unique
  test('Property 31: Generated API keys are unique', () => {
    // Feature: saas-backend-layer, Property 31: API key generation
    const keys = new Set<string>();
    
    for (let i = 0; i < 1000; i++) {
      const key = generateApiKey();
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  // Property 31: API key hashing is deterministic
  test('Property 31: Same API key produces same hash', () => {
    // Feature: saas-backend-layer, Property 31: API key generation
    fc.assert(
      fc.property(fc.string({ minLength: 10 }), (apiKey) => {
        const hash1 = hashApiKey(apiKey);
        const hash2 = hashApiKey(apiKey);
        
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Property 32: Valid API key authentication
  test('Property 32: Valid API key authenticates successfully', async () => {
    // Feature: saas-backend-layer, Property 32: Valid API key authentication
    const tenantId = `tenant_${Date.now()}`;
    const name = 'Test API Key';
    
    const { apiKey } = await createApiKey(db, tenantId, name);
    
    const context = await validateApiKey(db, apiKey);
    
    expect(context.tenantId).toBe(tenantId);
  });

  // Property 33: Invalid API key rejection
  test('Property 33: Invalid API keys are rejected', async () => {
    // Feature: saas-backend-layer, Property 33: Invalid API key rejection
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.constant('sk_invalid_key'),
          fc.string({ minLength: 1, maxLength: 50 })
        ),
        async (invalidKey) => {
          await expect(validateApiKey(db, invalidKey)).rejects.toThrow(AppError);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  // Property 33: Malformed API keys are rejected
  test('Property 33: Malformed API key format is rejected', async () => {
    // Feature: saas-backend-layer, Property 33: Invalid API key rejection
    const malformedKeys = [
      '',
      'no_prefix',
      'wrong_prefix_abc123',
      'sk_',
      'Bearer sk_live_abc',
    ];

    for (const key of malformedKeys) {
      await expect(validateApiKey(db, key)).rejects.toThrow(AppError);
    }
  });
});
