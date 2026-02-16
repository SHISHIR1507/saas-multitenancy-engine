import { Context, Next } from 'hono';
import { Env } from '../types';
import { createDb } from '../db';
import { AppError } from './error-handler';
import { sql } from 'drizzle-orm';

// Simple in-memory rate limiter (for development)
// In production, use Redis or similar distributed cache
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const tenantId = c.get('tenantId') as string;
  
  if (!tenantId) {
    // No tenant context yet (before API key auth), skip rate limiting
    await next();
    return;
  }

  const limit = parseInt(c.env.RATE_LIMIT_PER_MINUTE || '1000');
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  
  const key = `ratelimit:${tenantId}`;
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
  } else {
    // Within window
    record.count++;
    
    if (record.count > limit) {
      const resetIn = Math.ceil((record.resetAt - now) / 1000);
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Try again in ${resetIn} seconds`,
        429,
        { limit, resetIn }
      );
    }
  }

  // Set rate limit headers
  const current = rateLimitStore.get(key)!;
  c.header('X-RateLimit-Limit', limit.toString());
  c.header('X-RateLimit-Remaining', Math.max(0, limit - current.count).toString());
  c.header('X-RateLimit-Reset', new Date(current.resetAt).toISOString());

  await next();
}

// Cleanup old entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt + 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute
