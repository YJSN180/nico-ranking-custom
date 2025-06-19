import '@testing-library/jest-dom'
import { vi } from 'vitest'
import './__tests__/mocks/next-router'
import React from 'react'

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return React.createElement('img', {
      ...props,
      src: props.src,
      width: props.width,
      height: props.height,
      alt: props.alt,
      loading: props.priority ? undefined : 'lazy',
    })
  }
}))

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('CRON_SECRET', 'test-cron-secret')
vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account-id')
vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace-id')
vi.stubEnv('CLOUDFLARE_KV_API_TOKEN', 'test-cf-token')

// Mock console methods to avoid test output
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}