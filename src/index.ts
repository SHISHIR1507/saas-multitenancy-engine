import { Hono } from 'hono';
import { Env } from './types';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { createDb } from './db';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', requestIdMiddleware);

// Error handling
app.onError(errorHandler);

// Health check endpoint with database connectivity check
app.get('/health', async (c) => {
  const startTime = Date.now();
  
  try {
    // Check database connectivity
    const db = createDb(c.env.DATABASE_URL);
    
    // Simple query to verify database is accessible
    await db.execute('SELECT 1');
    
    const responseTime = Date.now() - startTime;
    
    return c.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT,
      checks: {
        database: 'connected',
      },
      responseTimeMs: responseTime,
    }, 200);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return c.json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT,
      checks: {
        database: 'disconnected',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTimeMs: responseTime,
    }, 503);
  }
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
