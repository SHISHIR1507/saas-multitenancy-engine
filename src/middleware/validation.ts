import { Context } from 'hono';
import { AppError } from './error-handler';

// Email validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Password validation (min 8 chars, at least one letter and one number)
export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

// Validate request body has required fields
export function validateRequired(data: any, fields: string[]): void {
  for (const field of fields) {
    if (!data[field]) {
      throw new AppError(
        'MISSING_REQUIRED_FIELD',
        `Missing required field: ${field}`,
        400,
        { field }
      );
    }
  }
}

// Sanitize string input (basic XSS prevention)
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Validate string length
export function validateStringLength(
  value: string,
  fieldName: string,
  minLength: number,
  maxLength: number
): void {
  if (value.length < minLength) {
    throw new AppError(
      'INVALID_INPUT',
      `${fieldName} must be at least ${minLength} characters`,
      400,
      { field: fieldName, minLength }
    );
  }
  if (value.length > maxLength) {
    throw new AppError(
      'INVALID_INPUT',
      `${fieldName} must be at most ${maxLength} characters`,
      400,
      { field: fieldName, maxLength }
    );
  }
}

// Detect potential SQL injection attempts
export function containsSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/)/,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i,
    /(UNION.*SELECT)/i,
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

// Validate input doesn't contain SQL injection
export function validateNoSQLInjection(input: string, fieldName: string): void {
  if (containsSQLInjection(input)) {
    throw new AppError(
      'INVALID_INPUT',
      `${fieldName} contains invalid characters`,
      400,
      { field: fieldName }
    );
  }
}

// Validate alphanumeric with specific allowed characters
export function validateAlphanumeric(
  input: string,
  fieldName: string,
  allowedChars: string = '_-'
): void {
  const regex = new RegExp(`^[a-zA-Z0-9${allowedChars}]+$`);
  if (!regex.test(input)) {
    throw new AppError(
      'INVALID_INPUT',
      `${fieldName} can only contain letters, numbers, and ${allowedChars}`,
      400,
      { field: fieldName }
    );
  }
}

// Validate URL format
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Validate JSON structure
export function isValidJSON(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

// Comprehensive input sanitization
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return sanitizeString(input);
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  return input;
}
