import { vi, beforeAll, afterAll } from 'vitest';
import DatabaseManager from '../core/database';

// Prevent pino-pretty from being loaded in the test environment.
// The pino transport spawns a worker thread that can cause SyntaxError
// in Vitest's transform pipeline.
vi.mock('pino', () => {
  const noop = () => {};
  const logger = {
    info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop,
    child: () => logger,
  };
  return { default: () => logger };
});

// Use an in-memory SQLite DB for all tests
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SECRET_KEY = 'test-secret-key-at-least-16-chars';
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
  DatabaseManager.initialize(':memory:');
});

afterAll(() => {
  DatabaseManager.close();
});
