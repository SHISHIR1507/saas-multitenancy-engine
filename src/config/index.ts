/**
 * Configuration Management System
 * 
 * Provides environment-specific configuration with sensible defaults.
 * Configuration is loaded from environment variables.
 */

import { Env } from '../types';

export interface AppConfig {
  // Environment
  environment: 'development' | 'staging' | 'production' | 'test';
  
  // Database
  databaseUrl: string;
  
  // Authentication
  jwtSecret: string;
  bcryptWorkFactor: number;
  sessionExpirationSeconds: number;
  
  // Email
  resendApiKey?: string;
  
  // Rate Limiting
  rateLimitPerMinute: number;
  
  // Defaults
  defaults: {
    role: string;
    subscriptionTier?: string;
  };
}

/**
 * Default configuration values for different environments
 */
const DEFAULT_CONFIGS: Record<string, Partial<AppConfig>> = {
  development: {
    environment: 'development',
    bcryptWorkFactor: 10,
    sessionExpirationSeconds: 604800, // 7 days
    rateLimitPerMinute: 1000,
    defaults: {
      role: 'member',
    },
  },
  staging: {
    environment: 'staging',
    bcryptWorkFactor: 11,
    sessionExpirationSeconds: 604800, // 7 days
    rateLimitPerMinute: 500,
    defaults: {
      role: 'member',
    },
  },
  production: {
    environment: 'production',
    bcryptWorkFactor: 12,
    sessionExpirationSeconds: 604800, // 7 days
    rateLimitPerMinute: 1000,
    defaults: {
      role: 'member',
    },
  },
  test: {
    environment: 'test',
    bcryptWorkFactor: 4, // Faster for tests
    sessionExpirationSeconds: 3600, // 1 hour
    rateLimitPerMinute: 10000,
    defaults: {
      role: 'member',
    },
  },
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(env: Env): AppConfig {
  const environment = (env.ENVIRONMENT || 'development') as AppConfig['environment'];
  const defaults = DEFAULT_CONFIGS[environment] || DEFAULT_CONFIGS.development;
  
  return {
    environment,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    bcryptWorkFactor: env.BCRYPT_WORK_FACTOR 
      ? parseInt(env.BCRYPT_WORK_FACTOR, 10) 
      : defaults.bcryptWorkFactor!,
    sessionExpirationSeconds: env.SESSION_EXPIRATION 
      ? parseInt(env.SESSION_EXPIRATION, 10) 
      : defaults.sessionExpirationSeconds!,
    resendApiKey: env.RESEND_API_KEY,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE 
      ? parseInt(env.RATE_LIMIT_PER_MINUTE, 10) 
      : defaults.rateLimitPerMinute!,
    defaults: {
      role: defaults.defaults!.role,
      subscriptionTier: defaults.defaults!.subscriptionTier,
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: AppConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!config.databaseUrl) {
    errors.push('DATABASE_URL is required');
  }
  
  if (!config.jwtSecret) {
    errors.push('JWT_SECRET is required');
  }
  
  // Validate bcrypt work factor
  if (config.bcryptWorkFactor < 4 || config.bcryptWorkFactor > 31) {
    errors.push('BCRYPT_WORK_FACTOR must be between 4 and 31');
  }
  
  // Validate session expiration
  if (config.sessionExpirationSeconds < 60) {
    errors.push('SESSION_EXPIRATION must be at least 60 seconds');
  }
  
  // Validate rate limit
  if (config.rateLimitPerMinute < 1) {
    errors.push('RATE_LIMIT_PER_MINUTE must be at least 1');
  }
  
  // Validate environment
  const validEnvironments = ['development', 'staging', 'production', 'test'];
  if (!validEnvironments.includes(config.environment)) {
    errors.push(`ENVIRONMENT must be one of: ${validEnvironments.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default configuration for an environment
 */
export function getDefaultConfig(environment: string): Partial<AppConfig> {
  return DEFAULT_CONFIGS[environment] || DEFAULT_CONFIGS.development;
}

/**
 * Merge custom configuration with defaults
 */
export function mergeConfig(
  base: Partial<AppConfig>,
  custom: Partial<AppConfig>
): Partial<AppConfig> {
  return {
    ...base,
    ...custom,
    defaults: {
      ...base.defaults,
      ...custom.defaults,
    },
  };
}
