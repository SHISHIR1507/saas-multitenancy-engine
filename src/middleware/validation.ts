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
