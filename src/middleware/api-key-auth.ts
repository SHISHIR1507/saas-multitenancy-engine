import { Context, Next } from 'hono';
import { Env } from '../types';
import { createDb } from '../db';
import { validateApiKey } from '../services/api-key';
import { AppError } from './error-handler';

// Middleware to authenticate API key and set tenant context
export async function apiKeyAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // Extract API key from Authorization header
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    throw new AppError('MISSING_AUTH', 'Missing Authorization header', 401);
  }

  // Expected format: "Bearer sk_live_..."
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError('INVALID_API_KEY', 'Invalid Authorization header format', 401);
  }

  const apiKey = parts[1];

  // Validate API key and get tenant context
  const db = createDb(c.env.DATABASE_URL);
  const tenantContext = await validateApiKey(db, apiKey);

  // Store tenant context in request context
  c.set('tenantId', tenantContext.tenantId);

  await next();
}
