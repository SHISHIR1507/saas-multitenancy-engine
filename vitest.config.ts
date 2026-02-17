import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load environment variables from .dev.vars for tests
config({ path: '.dev.vars' });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds for property-based tests
  },
});
