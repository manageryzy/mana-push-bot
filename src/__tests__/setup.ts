// Test setup file to configure testing environment
import { logger } from '@/utils/logger';

// Suppress winston console output during tests
beforeAll(() => {
  // Remove console transport or set it to silent
  logger.silent = true;
});

afterAll(() => {
  // Re-enable logging after tests (if needed)
  logger.silent = false;
});
