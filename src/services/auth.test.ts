import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { register, login, validateSession, logout } from './auth';
import { createDb } from '../db';
import * as bcrypt from 'bcryptjs';

const db = createDb(process.env.DATABASE_URL!);

// Generators for property-based testing
const emailArb = fc.emailAddress();
const passwordArb = fc.string({ minLength: 8, maxLength: 32 })
  .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s));
const tenantIdArb = fc.string({ minLength: 5, maxLength: 20 }).map(s => `tenant_${s}`);

describe('Authentication Service - Registration', () => {
  // Property 1: Valid registration creates user and session
  test('Property 1: Valid registration creates user and session', async () => {
    // Feature: saas-backend-layer, Property 1: Valid registration creates user and session
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        passwordArb,
        tenantIdArb,
        async (email, password, tenantId) => {
          const result = await register(db, email, password, tenantId, 10, 604800);
          
          expect(result.user).toBeDefined();
          expect(result.user.email).toBe(email);
          expect(result.user.tenantId).toBe(tenantId);
          expect(result.token).toBeDefined();
          expect(result.token.length).toBeGreaterThan(20);
          
          // Verify session token works
          const session = await validateSession(db, result.token);
          expect(session?.userId).toBe(result.user.id);
          expect(session?.tenantId).toBe(tenantId);
          
          return true;
        }
      ),
      { numRuns: 20 } // Reduced runs for database tests
    );
  });

  // Property 8: Passwords are hashed
  test('Property 8: Passwords are hashed with bcrypt', async () => {
    // Feature: saas-backend-layer, Property 8: Passwords are hashed
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        passwordArb,
        tenantIdArb,
        async (email, password, tenantId) => {
          const result = await register(db, email, password, tenantId, 10, 604800);
          
          // Password hash should not equal plaintext password
          expect(result.user.passwordHash).not.toBe(password);
          
          // Password hash should be a valid bcrypt hash
          expect(result.user.passwordHash).toMatch(/^\$2[aby]\$/);
          
          // Should be able to verify password with bcrypt
          const isValid = await bcrypt.compare(password, result.user.passwordHash);
          expect(isValid).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Test duplicate email rejection
  test('Duplicate email registration is rejected', async () => {
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123';
    const tenantId = `tenant_${Date.now()}`;
    
    // First registration should succeed
    await register(db, email, password, tenantId, 10, 604800);
    
    // Second registration with same email should fail
    await expect(
      register(db, email, password, tenantId, 10, 604800)
    ).rejects.toThrow('DUPLICATE_EMAIL');
  });

  // Test invalid email rejection
  test('Invalid email format is rejected', async () => {
    const invalidEmails = ['notanemail', '@example.com', 'user@', 'user'];
    const password = 'Password123';
    const tenantId = `tenant_${Date.now()}`;
    
    for (const email of invalidEmails) {
      await expect(
        register(db, email, password, tenantId, 10, 604800)
      ).rejects.toThrow('INVALID_EMAIL');
    }
  });

  // Test weak password rejection
  test('Weak passwords are rejected', async () => {
    const weakPasswords = ['short', '12345678', 'noNumbers', 'NoLetters123'];
    const email = `test_${Date.now()}@example.com`;
    const tenantId = `tenant_${Date.now()}`;
    
    for (const password of weakPasswords) {
      await expect(
        register(db, email, password, tenantId, 10, 604800)
      ).rejects.toThrow('WEAK_PASSWORD');
    }
  });
});

describe('Authentication Service - Login', () => {
  // Property 2: Valid login returns session
  test('Property 2: Valid login returns session token', async () => {
    // Feature: saas-backend-layer, Property 2: Valid login returns session
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        passwordArb,
        tenantIdArb,
        async (email, password, tenantId) => {
          // Register user first
          await register(db, email, password, tenantId, 10, 604800);
          
          // Login should succeed
          const result = await login(db, email, password, tenantId, 604800);
          
          expect(result.user).toBeDefined();
          expect(result.user.email).toBe(email);
          expect(result.token).toBeDefined();
          
          // Session should be valid
          const session = await validateSession(db, result.token);
          expect(session?.userId).toBe(result.user.id);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Property 3: Invalid credentials are rejected
  test('Property 3: Invalid credentials are rejected', async () => {
    // Feature: saas-backend-layer, Property 3: Invalid credentials are rejected
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123';
    const tenantId = `tenant_${Date.now()}`;
    
    // Register user
    await register(db, email, password, tenantId, 10, 604800);
    
    // Wrong password should fail
    await expect(
      login(db, email, 'WrongPassword123', tenantId, 604800)
    ).rejects.toThrow('INVALID_CREDENTIALS');
    
    // Non-existent email should fail
    await expect(
      login(db, 'nonexistent@example.com', password, tenantId, 604800)
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });
});

describe('Authentication Service - Session Management', () => {
  // Property 4: Valid session tokens authenticate requests
  test('Property 4: Valid session tokens authenticate requests', async () => {
    // Feature: saas-backend-layer, Property 4: Valid session tokens authenticate requests
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123';
    const tenantId = `tenant_${Date.now()}`;
    
    const { user, token } = await register(db, email, password, tenantId, 10, 604800);
    
    const session = await validateSession(db, token);
    
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(user.id);
    expect(session?.tenantId).toBe(tenantId);
    expect(session?.email).toBe(email);
  });

  // Property 5: Invalid session tokens are rejected
  test('Property 5: Invalid session tokens are rejected', async () => {
    // Feature: saas-backend-layer, Property 5: Invalid session tokens are rejected
    const invalidTokens = [
      'invalid_token',
      '',
      'a'.repeat(100),
      'fake-session-token-123',
    ];
    
    for (const token of invalidTokens) {
      const session = await validateSession(db, token);
      expect(session).toBeNull();
    }
  });

  // Property 6: Logout invalidates session
  test('Property 6: Logout invalidates session token', async () => {
    // Feature: saas-backend-layer, Property 6: Logout invalidates session
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123';
    const tenantId = `tenant_${Date.now()}`;
    
    const { token } = await register(db, email, password, tenantId, 10, 604800);
    
    // Session should be valid before logout
    let session = await validateSession(db, token);
    expect(session).not.toBeNull();
    
    // Logout
    await logout(db, token);
    
    // Session should be invalid after logout
    session = await validateSession(db, token);
    expect(session).toBeNull();
  });

  // Property 9: Session tokens are cryptographically random
  test('Property 9: Session tokens are unique and random', async () => {
    // Feature: saas-backend-layer, Property 9: Session tokens are cryptographically random
    const tokens = new Set<string>();
    const tenantId = `tenant_${Date.now()}`;
    
    // Generate multiple sessions
    for (let i = 0; i < 100; i++) {
      const email = `test_${Date.now()}_${i}@example.com`;
      const password = 'Password123';
      
      const { token } = await register(db, email, password, tenantId, 10, 604800);
      
      // Token should be unique
      expect(tokens.has(token)).toBe(false);
      tokens.add(token);
      
      // Token should have sufficient length
      expect(token.length).toBeGreaterThan(20);
    }
  });
});
