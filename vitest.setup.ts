import '@testing-library/jest-dom'
import { vi } from 'vitest'
import './__tests__/mocks/next-router'
import React from 'react'

// Mock IndexedDB for tests
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import FDBRequest from 'fake-indexeddb/lib/FDBRequest'
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase'
import FDBTransaction from 'fake-indexeddb/lib/FDBTransaction'
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore'
import FDBIndex from 'fake-indexeddb/lib/FDBIndex'
import FDBCursor from 'fake-indexeddb/lib/FDBCursor'

global.indexedDB = new FDBFactory()
global.IDBKeyRange = FDBKeyRange
global.IDBRequest = FDBRequest
global.IDBDatabase = FDBDatabase
global.IDBTransaction = FDBTransaction
global.IDBObjectStore = FDBObjectStore
global.IDBIndex = FDBIndex
global.IDBCursor = FDBCursor

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

// Mock window.matchMedia for JSDOM
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Mock Element.scrollTo for JSDOM
if (typeof Element !== 'undefined') {
  Element.prototype.scrollTo = vi.fn()
}

// Mock window.confirm for JSDOM
if (typeof window !== 'undefined') {
  window.confirm = vi.fn(() => true)
}

// styled-jsx is now properly installed as a dependency

// Mock CSS modules - Using individual mock approach for CI compatibility
// The wildcard pattern doesn't work reliably in CI environment

// CSS modules mock for components
vi.mock('*.module.css', () => {
  return {
    default: new Proxy({}, {
      get: (target, prop) => prop
    })
  }
})