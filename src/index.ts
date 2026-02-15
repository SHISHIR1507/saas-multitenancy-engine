import { Hono } from 'hono';
import { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Placeholder for API routes
app.get('/', (c) => {
  return c.json({ 
    message: 'SaaS Backend Layer API',
    version: '1.0.0'
  });
});

export default app;
