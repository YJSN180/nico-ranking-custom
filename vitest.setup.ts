import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.KV_REST_API_URL = 'http://localhost:8080'
process.env.KV_REST_API_TOKEN = 'test-token'
process.env.CRON_SECRET = 'test-cron-secret'

// Mock console methods to avoid test output
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}