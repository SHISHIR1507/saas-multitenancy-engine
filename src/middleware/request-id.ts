import { Context, Next } from 'hono';

// Adds a unique request ID to every request for tracking
export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
}
