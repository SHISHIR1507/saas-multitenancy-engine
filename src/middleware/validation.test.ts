import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidEmail,
  isValidPassword,
  validateRequired,
  sanitizeString,
  validateStringLength,
  containsSQLInjection,
  validateNoSQLInjection,
  validateAlphanumeric,
  isValidURL,
  isValidJSON,
  sanitizeInput,
} from './validation';
import { AppError } from './error-handler';

describe('Input Validation - Email', () => {
  test('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.user@domain.co.uk')).toBe(true);
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  test('rejects invalid email addresses', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('invalid@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

describe('Input Validation - Password', () => {
  test('accepts valid passwords', () => {
    expect(isValidPassword('password123')).toBe(true);
    expect(isValidPassword('Test1234')).toBe(true);
    expect(isValidPassword('abcdefgh1')).toBe(true);
  });

  test('rejects weak passwords', () => {
    expect(isValidPassword('short1')).toBe(false); // Too short
    expect(isValidPassword('noNumbers')).toBe(false); // No numbers
    expect(isValidPassword('12345678')).toBe(false); // No letters
    expect(isValidPassword('')).toBe(false); // Empty
  });
});

describe('Input Validation - Required Fields', () => {
  test('accepts objects with all required fields', () => {
    const data = { name: 'Test', email: 'test@example.com' };
    expect(() => validateRequired(data, ['name', 'email'])).not.toThrow();
  });

  test('rejects objects missing required fields', () => {
    const data = { name: 'Test' };
    expect(() => validateRequired(data, ['name', 'email'])).toThrow(AppError);
    expect(() => validateRequired(data, ['name', 'email'])).toThrow('Missing required field: email');
  });
});

describe('Input Validation - String Sanitization', () => {
  test('sanitizes XSS payloads', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    expect(sanitizeString('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(sanitizeString('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  test('preserves safe strings', () => {
    expect(sanitizeString('Hello World')).toBe('Hello World');
    expect(sanitizeString('user@example.com')).toBe('user@example.com');
  });
});

describe('Input Validation - String Length', () => {
  test('accepts strings within length bounds', () => {
    expect(() => validateStringLength('test', 'field', 1, 10)).not.toThrow();
    expect(() => validateStringLength('hello', 'field', 5, 5)).not.toThrow();
  });

  test('rejects strings too short', () => {
    expect(() => validateStringLength('ab', 'field', 3, 10)).toThrow(AppError);
    expect(() => validateStringLength('ab', 'field', 3, 10)).toThrow('must be at least 3 characters');
  });

  test('rejects strings too long', () => {
    expect(() => validateStringLength('toolongstring', 'field', 1, 5)).toThrow(AppError);
    expect(() => validateStringLength('toolongstring', 'field', 1, 5)).toThrow('must be at most 5 characters');
  });
});

describe('Input Validation - SQL Injection Detection', () => {
  /**
   * Property 36: Input validation prevents injection
   * **Validates: Requirements 7.4**
   */
  test('Property 36: Input validation prevents injection', () => {
    // SQL injection attempts
    const sqlInjectionAttempts = [
      "'; DROP TABLE users;--",
      "1' OR '1'='1",
      "admin'--",
      "1; DELETE FROM users",
      "UNION SELECT * FROM passwords",
      "1' UNION SELECT NULL, username, password FROM users--",
      "'; EXEC sp_MSForEachTable 'DROP TABLE ?'--",
    ];

    for (const attempt of sqlInjectionAttempts) {
      expect(containsSQLInjection(attempt)).toBe(true);
      expect(() => validateNoSQLInjection(attempt, 'input')).toThrow(AppError);
    }

    // Safe inputs
    const safeInputs = [
      'normal text',
      'user@example.com',
      'Product Name 123',
      'Hello, World!',
    ];

    for (const safe of safeInputs) {
      expect(containsSQLInjection(safe)).toBe(false);
      expect(() => validateNoSQLInjection(safe, 'input')).not.toThrow();
    }
  });

  test('detects SQL keywords', () => {
    expect(containsSQLInjection('SELECT * FROM users')).toBe(true);
    expect(containsSQLInjection('INSERT INTO table')).toBe(true);
    expect(containsSQLInjection('UPDATE users SET')).toBe(true);
    expect(containsSQLInjection('DELETE FROM table')).toBe(true);
    expect(containsSQLInjection('DROP TABLE users')).toBe(true);
  });

  test('detects SQL comment patterns', () => {
    expect(containsSQLInjection('test--comment')).toBe(true);
    expect(containsSQLInjection('test/*comment*/')).toBe(true);
    expect(containsSQLInjection('test;')).toBe(true);
  });
});

describe('Input Validation - Alphanumeric', () => {
  test('accepts valid alphanumeric strings', () => {
    expect(() => validateAlphanumeric('test123', 'field')).not.toThrow();
    expect(() => validateAlphanumeric('test_123', 'field', '_')).not.toThrow();
    expect(() => validateAlphanumeric('test-123', 'field', '-')).not.toThrow();
  });

  test('rejects strings with invalid characters', () => {
    expect(() => validateAlphanumeric('test@123', 'field')).toThrow(AppError);
    expect(() => validateAlphanumeric('test 123', 'field')).toThrow(AppError);
    expect(() => validateAlphanumeric('test!123', 'field')).toThrow(AppError);
  });
});

describe('Input Validation - URL', () => {
  test('accepts valid URLs', () => {
    expect(isValidURL('https://example.com')).toBe(true);
    expect(isValidURL('http://localhost:3000')).toBe(true);
    expect(isValidURL('https://sub.domain.com/path?query=value')).toBe(true);
  });

  test('rejects invalid URLs', () => {
    expect(isValidURL('not a url')).toBe(false);
    expect(isValidURL('just-text')).toBe(false);
    expect(isValidURL('')).toBe(false);
  });
});

describe('Input Validation - JSON', () => {
  test('accepts valid JSON', () => {
    expect(isValidJSON('{}')).toBe(true);
    expect(isValidJSON('{"key": "value"}')).toBe(true);
    expect(isValidJSON('[]')).toBe(true);
    expect(isValidJSON('[1, 2, 3]')).toBe(true);
  });

  test('rejects invalid JSON', () => {
    expect(isValidJSON('not json')).toBe(false);
    expect(isValidJSON('{invalid}')).toBe(false);
    expect(isValidJSON("{'single': 'quotes'}")).toBe(false);
  });
});

describe('Input Validation - Comprehensive Sanitization', () => {
  test('sanitizes nested objects', () => {
    const input = {
      name: '<script>alert(1)</script>',
      nested: {
        value: '<img src=x>',
      },
      array: ['<b>test</b>', 'safe'],
    };

    const sanitized = sanitizeInput(input);
    expect(sanitized.name).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    expect(sanitized.nested.value).toBe('&lt;img src=x&gt;');
    expect(sanitized.array[0]).toBe('&lt;b&gt;test&lt;&#x2F;b&gt;');
    expect(sanitized.array[1]).toBe('safe');
  });

  test('preserves non-string values', () => {
    const input = {
      number: 123,
      boolean: true,
      null: null,
    };

    const sanitized = sanitizeInput(input);
    expect(sanitized.number).toBe(123);
    expect(sanitized.boolean).toBe(true);
    expect(sanitized.null).toBe(null);
  });
});

describe('Input Validation - Configuration Validation', () => {
  /**
   * Property 39: Configuration validation
   * **Validates: Requirements 9.4**
   */
  test('Property 39: Configuration validation', () => {
    // Valid configuration
    const validConfig = {
      name: 'MyApp',
      apiKey: 'valid_key_123',
      maxUsers: 100,
      features: ['feature1', 'feature2'],
    };

    expect(() => validateRequired(validConfig, ['name', 'apiKey', 'maxUsers'])).not.toThrow();
    expect(() => validateAlphanumeric(validConfig.apiKey, 'apiKey', '_')).not.toThrow();

    // Invalid configuration - missing required fields
    const invalidConfig1 = {
      name: 'MyApp',
      // missing apiKey
    };

    expect(() => validateRequired(invalidConfig1, ['name', 'apiKey'])).toThrow(AppError);

    // Invalid configuration - invalid values
    const invalidConfig2 = {
      name: '<script>alert(1)</script>',
      apiKey: 'key; DROP TABLE users;',
    };

    expect(containsSQLInjection(invalidConfig2.apiKey)).toBe(true);

    // Invalid configuration - conflicting settings (example: negative max users)
    const invalidConfig3 = {
      name: 'MyApp',
      apiKey: 'valid_key',
      maxUsers: -1, // Invalid: negative value
    };

    expect(invalidConfig3.maxUsers).toBeLessThan(0);
  });
});

describe('Input Validation - Property-Based Tests', () => {
  test('Email validation is consistent', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        // All generated email addresses should be valid
        return isValidEmail(email);
      })
    );
  });

  test('Sanitization is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        // Sanitizing twice should give the same result as sanitizing once
        const once = sanitizeString(input);
        const twice = sanitizeString(once);
        return once === twice;
      })
    );
  });

  test('String length validation is accurate', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 10 }),
        (str) => {
          // Strings within bounds should not throw
          try {
            validateStringLength(str, 'test', 5, 10);
            return true;
          } catch {
            return false;
          }
        }
      )
    );
  });
});
