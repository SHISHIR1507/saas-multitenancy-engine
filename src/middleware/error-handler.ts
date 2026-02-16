import { Context } from 'hono';
import { ErrorResponse } from '../types';

// Custom error class for application errors
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Error handler middleware
export async function errorHandler(err: Error, c: Context): Promise<Response> {
  console.error('Error:', err);

  const requestId = c.req.header('x-request-id') || crypto.randomUUID();

  if (err instanceof AppError) {
    const errorResponse: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    };
    return c.json(errorResponse, err.statusCode);
  }

  // Unknown error
  const errorResponse: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  };
  return c.json(errorResponse, 500);
}
