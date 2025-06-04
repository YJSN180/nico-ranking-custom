import '@testing-library/jest-dom'
import { vi } from 'vitest'

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

// Mock Next.js navigation globally
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    keys: vi.fn(() => []),
    values: vi.fn(() => []),
    entries: vi.fn(() => []),
    forEach: vi.fn(),
    toString: vi.fn(() => ''),
  }),
  usePathname: () => '/',
}))

// Mock window.scrollTo to avoid jsdom errors
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
})