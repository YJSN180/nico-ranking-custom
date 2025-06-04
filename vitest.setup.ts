import '@testing-library/jest-dom'
import { vi } from 'vitest'
import './__tests__/mocks/next-router'

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('KV_REST_API_URL', 'http://localhost:8080')
vi.stubEnv('KV_REST_API_TOKEN', 'test-token')
vi.stubEnv('CRON_SECRET', 'test-cron-secret')

// Mock console methods to avoid test output
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}