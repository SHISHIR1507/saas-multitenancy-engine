/**
 * Structured Logging System
 * 
 * Provides structured logging with context (tenant ID, user ID, request ID)
 * Ensures sensitive data is never logged
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  organizationId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

// Sensitive fields that should never be logged
const SENSITIVE_FIELDS = [
  'password',
  'passwordhash',
  'token',
  'apikey',
  'secret',
  'authorization',
  'cookie',
  'sessiontoken',
];

/**
 * Removes sensitive data from objects before logging
 */
function sanitizeForLogging(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      // Check if key is sensitive
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(data[key]);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Formats a log entry as JSON
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Logger class with structured logging
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = sanitizeForLogging(context);
  }

  /**
   * Creates a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({
      ...this.context,
      ...sanitizeForLogging(additionalContext),
    });
  }

  /**
   * Logs a debug message
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error | any, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      context: {
        ...this.context,
        ...sanitizeForLogging(data),
      },
    };

    // Add error details if provided
    if (error) {
      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        };
      } else {
        entry.error = {
          name: 'Error',
          message: String(error),
        };
      }
    }

    console.error(formatLogEntry(entry));
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...this.context,
        ...sanitizeForLogging(data),
      },
    };

    const output = formatLogEntry(entry);

    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }
}

/**
 * Creates a logger with the given context
 */
export function createLogger(context: LogContext = {}): Logger {
  return new Logger(context);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Logs authentication failures
 */
export function logAuthFailure(
  tenantId: string,
  email: string,
  reason: string,
  requestId?: string
): void {
  const authLogger = createLogger({
    tenantId,
    requestId,
    event: 'auth_failure',
  });

  authLogger.warn('Authentication failed', {
    email,
    reason,
  });
}

/**
 * Logs authentication successes
 */
export function logAuthSuccess(
  tenantId: string,
  userId: string,
  email: string,
  requestId?: string
): void {
  const authLogger = createLogger({
    tenantId,
    userId,
    requestId,
    event: 'auth_success',
  });

  authLogger.info('Authentication successful', {
    email,
  });
}

/**
 * Logs API errors
 */
export function logApiError(
  error: Error,
  context: LogContext
): void {
  const apiLogger = createLogger(context);
  apiLogger.error('API error occurred', error);
}
