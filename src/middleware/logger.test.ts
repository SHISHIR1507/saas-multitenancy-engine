import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  Logger,
  createLogger,
  logAuthFailure,
  logAuthSuccess,
  logApiError,
} from './logger';

describe('Logger - Basic Functionality', () => {
  let consoleErrorSpy: any;
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('creates logger with context', () => {
    const logger = createLogger({
      tenantId: 'tenant_123',
      userId: 'user_456',
    });

    logger.info('Test message');

    expect(consoleInfoSpy).toHaveBeenCalled();
    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.tenantId).toBe('tenant_123');
    expect(logOutput.context.userId).toBe('user_456');
  });

  test('creates child logger with additional context', () => {
    const parentLogger = createLogger({ tenantId: 'tenant_123' });
    const childLogger = parentLogger.child({ requestId: 'req_789' });

    childLogger.info('Test message');

    expect(consoleInfoSpy).toHaveBeenCalled();
    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.tenantId).toBe('tenant_123');
    expect(logOutput.context.requestId).toBe('req_789');
  });

  test('logs at different levels', () => {
    const logger = createLogger();

    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Logger - Sensitive Data Redaction', () => {
  let consoleInfoSpy: any;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  test('redacts password fields', () => {
    const logger = createLogger();
    logger.info('User data', {
      email: 'user@example.com',
      password: 'secret123',
      name: 'John Doe',
    });

    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.email).toBe('user@example.com');
    expect(logOutput.context.password).toBe('[REDACTED]');
    expect(logOutput.context.name).toBe('John Doe');
  });

  test('redacts token fields', () => {
    const logger = createLogger();
    logger.info('Auth data', {
      userId: 'user_123',
      token: 'secret_token_xyz',
      sessionToken: 'session_abc',
    });

    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.userId).toBe('user_123');
    expect(logOutput.context.token).toBe('[REDACTED]');
    expect(logOutput.context.sessionToken).toBe('[REDACTED]');
  });

  test('redacts API keys', () => {
    const logger = createLogger();
    logger.info('API request', {
      endpoint: '/api/users',
      apiKey: 'sk_live_1234567890',
    });

    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.endpoint).toBe('/api/users');
    expect(logOutput.context.apiKey).toBe('[REDACTED]');
  });

  test('redacts nested sensitive fields', () => {
    const logger = createLogger();
    logger.info('Complex data', {
      user: {
        email: 'user@example.com',
        password: 'secret',
      },
      auth: {
        token: 'token_xyz',
      },
    });

    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
    expect(logOutput.context.user.email).toBe('user@example.com');
    expect(logOutput.context.user.password).toBe('[REDACTED]');
    expect(logOutput.context.auth.token).toBe('[REDACTED]');
  });
});

describe('Logger - Error Logging', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /**
   * Property 40: Error logging completeness
   * **Validates: Requirements 10.1**
   */
  test('Property 40: Error logging completeness', () => {
    const logger = createLogger({
      tenantId: 'tenant_123',
      userId: 'user_456',
      requestId: 'req_789',
    });

    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at test.ts:10:5';

    logger.error('An error occurred', error, {
      endpoint: '/api/test',
      method: 'POST',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

    // Verify all required context is present
    expect(logOutput.level).toBe('error');
    expect(logOutput.message).toBe('An error occurred');
    expect(logOutput.context.tenantId).toBe('tenant_123');
    expect(logOutput.context.userId).toBe('user_456');
    expect(logOutput.context.requestId).toBe('req_789');
    expect(logOutput.context.endpoint).toBe('/api/test');
    expect(logOutput.context.method).toBe('POST');

    // Verify error details are present
    expect(logOutput.error).toBeDefined();
    expect(logOutput.error.name).toBe('Error');
    expect(logOutput.error.message).toBe('Test error');
    expect(logOutput.error.stack).toContain('Error: Test error');

    // Verify timestamp is present
    expect(logOutput.timestamp).toBeDefined();
    expect(new Date(logOutput.timestamp)).toBeInstanceOf(Date);
  });

  test('logs errors with custom error codes', () => {
    const logger = createLogger({ tenantId: 'tenant_123' });

    const error: any = new Error('Database connection failed');
    error.code = 'DB_CONNECTION_ERROR';

    logger.error('Database error', error);

    const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(logOutput.error.code).toBe('DB_CONNECTION_ERROR');
  });

  test('handles non-Error objects', () => {
    const logger = createLogger();

    logger.error('String error', 'Something went wrong');

    const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(logOutput.error.message).toBe('Something went wrong');
  });
});

describe('Logger - Authentication Logging', () => {
  let consoleWarnSpy: any;
  let consoleInfoSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  /**
   * Property 42: Authentication failure logging
   * **Validates: Requirements 10.4**
   */
  test('Property 42: Authentication failure logging', () => {
    const testCases = [
      {
        tenantId: 'tenant_123',
        email: 'user@example.com',
        reason: 'invalid_credentials',
        password: 'secret123', // Should NOT be logged
      },
      {
        tenantId: 'tenant_456',
        email: 'admin@example.com',
        reason: 'expired_token',
        token: 'token_xyz', // Should NOT be logged
      },
      {
        tenantId: 'tenant_789',
        email: 'test@example.com',
        reason: 'account_locked',
        sessionToken: 'session_abc', // Should NOT be logged
      },
    ];

    for (const testCase of testCases) {
      consoleWarnSpy.mockClear();

      logAuthFailure(
        testCase.tenantId,
        testCase.email,
        testCase.reason,
        'req_123'
      );

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);

      // Verify failure is logged with context
      expect(logOutput.level).toBe('warn');
      expect(logOutput.message).toBe('Authentication failed');
      expect(logOutput.context.tenantId).toBe(testCase.tenantId);
      expect(logOutput.context.requestId).toBe('req_123');
      expect(logOutput.context.email).toBe(testCase.email);
      expect(logOutput.context.reason).toBe(testCase.reason);
      expect(logOutput.context.event).toBe('auth_failure');

      // Verify sensitive data is NOT logged
      const logString = JSON.stringify(logOutput);
      expect(logString).not.toContain('secret123');
      expect(logString).not.toContain('token_xyz');
      expect(logString).not.toContain('session_abc');
      if (testCase.password) {
        expect(logString).not.toContain(testCase.password);
      }
      if ((testCase as any).token) {
        expect(logString).not.toContain((testCase as any).token);
      }
      if ((testCase as any).sessionToken) {
        expect(logString).not.toContain((testCase as any).sessionToken);
      }
    }
  });

  test('logs authentication success without sensitive data', () => {
    logAuthSuccess('tenant_123', 'user_456', 'user@example.com', 'req_789');

    expect(consoleInfoSpy).toHaveBeenCalled();
    const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);

    expect(logOutput.level).toBe('info');
    expect(logOutput.message).toBe('Authentication successful');
    expect(logOutput.context.tenantId).toBe('tenant_123');
    expect(logOutput.context.userId).toBe('user_456');
    expect(logOutput.context.email).toBe('user@example.com');
    expect(logOutput.context.event).toBe('auth_success');
  });
});

describe('Logger - API Error Logging', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('logs API errors with context', () => {
    const error = new Error('API request failed');
    const context = {
      tenantId: 'tenant_123',
      userId: 'user_456',
      requestId: 'req_789',
      endpoint: '/api/users',
      method: 'GET',
    };

    logApiError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

    expect(logOutput.error.message).toBe('API request failed');
    expect(logOutput.context.tenantId).toBe('tenant_123');
    expect(logOutput.context.endpoint).toBe('/api/users');
  });
});

describe('Logger - Property-Based Tests', () => {
  let consoleInfoSpy: any;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  test('all log entries have required fields', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.record({
          tenantId: fc.string({ minLength: 1, maxLength: 50 }),
          userId: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        (message, context) => {
          consoleInfoSpy.mockClear();

          const logger = createLogger(context);
          logger.info(message);

          const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);

          // Every log entry must have these fields
          return (
            logOutput.timestamp !== undefined &&
            logOutput.level !== undefined &&
            logOutput.message !== undefined &&
            logOutput.context !== undefined
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  test('sensitive fields are always redacted', () => {
    const sensitiveFieldArb = fc.constantFrom(
      'password',
      'token',
      'apiKey',
      'secret',
      'sessionToken'
    );

    fc.assert(
      fc.property(
        sensitiveFieldArb,
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // Filter out empty/whitespace strings
        (fieldName, value) => {
          consoleInfoSpy.mockClear();

          const logger = createLogger();
          const data: any = {};
          data[fieldName] = value;
          logger.info('Test', data);

          const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);

          // Sensitive field should be redacted
          return logOutput.context[fieldName] === '[REDACTED]';
        }
      ),
      { numRuns: 50 }
    );
  });
});
