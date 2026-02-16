import { Hono } from 'hono';
import { Env } from './types';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', requestIdMiddleware);

// Error handling
app.onError(errorHandler);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT 
  });
});

// API info
app.get('/', (c) => {
  return c.json({ 
    name: 'SaaS Backend Layer API',
    version: '1.0.0',
    documentation: '/docs'
  });
});

// API routes will be added here
// app.route('/auth', authRoutes);
// app.route('/organizations', organizationRoutes);
// etc.

export default app;
