// Uncomment below for debugging test setup issues
// console.log('[vitest.setup.ts] START - Loading test environment setup')

// Error handlers for debugging (uncomment if needed)
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('[vitest.setup.ts] Unhandled Rejection at:', promise, 'reason:', reason)
//   if (reason instanceof Error) {
//     console.error('[vitest.setup.ts] Stack trace:', reason.stack)
//   }
// })
// 
// process.on('uncaughtException', (error) => {
//   console.error('[vitest.setup.ts] Uncaught Exception:', error)
//   console.error('[vitest.setup.ts] Stack trace:', error.stack)
// })

// テスト環境の強制初期化を最初に実行
import './__tests__/test-environment'

import '@testing-library/jest-dom'
import { vi, expect, describe, it, test, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import './__tests__/mocks/next-router'
import React from 'react'

// Jest API compatibility - comprehensive mapping for Jest to Vitest migration
globalThis.jest = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  // Jest useFakeTimers returns an object with timer control methods
  // Vitest useFakeTimers returns void, so we provide compatibility layer
  useFakeTimers: (config?: any) => {
    vi.useFakeTimers(config)
    return {
      advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
      advanceTimersToNextTimer: vi.advanceTimersToNextTimer.bind(vi),
      runAllTimers: vi.runAllTimers.bind(vi),
      runOnlyPendingTimers: vi.runOnlyPendingTimers.bind(vi),
      clearAllTimers: vi.clearAllTimers.bind(vi),
      getTimerCount: () => vi.getTimerCount(),
      now: () => Date.now(),
      setSystemTime: (time: number | Date) => vi.setSystemTime(time),
    }
  },
  useRealTimers: vi.useRealTimers.bind(vi),
  clearAllTimers: vi.clearAllTimers.bind(vi),
  advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
  runAllTimers: vi.runAllTimers.bind(vi),
  runOnlyPendingTimers: vi.runOnlyPendingTimers.bind(vi),
  advanceTimersToNextTimer: vi.advanceTimersToNextTimer.bind(vi),
  getTimerCount: vi.getTimerCount.bind(vi),
  setSystemTime: vi.setSystemTime.bind(vi),
  mocked: vi.mocked,
  unmock: vi.unmock.bind(vi),
  mock: vi.mock.bind(vi),
  resetModules: vi.resetModules.bind(vi),
  isolateModules: vi.isolateModules.bind(vi),
  retryTimes: () => {},
  setTimeout: (timeout: number) => {},
} as any

globalThis.expect = expect
globalThis.describe = describe
globalThis.it = it
globalThis.test = test
globalThis.beforeEach = beforeEach
globalThis.afterEach = afterEach
globalThis.beforeAll = beforeAll
globalThis.afterAll = afterAll

// グローバルCSSをテスト環境でインポート（CSS変数対応）
import './app/globals.css'

// テスト環境でCSS変数のフォールバック定義
if (typeof document !== 'undefined' && document.createElement) {
  try {
    const style = document.createElement('style')
    if (style) {
      style.textContent = `
        :root {
          --bg-secondary: #f5f5f5;
          --bg-hover: #f0f0f0;
          --text-primary: #333333;
          --text-secondary: #595959;
          --border-color: #e5e5e5;
          --primary-color: #5567d8;
          --surface-color: #ffffff;
          --surface-secondary: #f5f5f5;
          --surface-hover: #f0f0f0;
          --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          --primary-color-hover: #4553c7;
        }
      `
      if (document.head) {
        document.head.appendChild(style)
      }
    }
  } catch (error) {
    console.warn('Failed to inject CSS variables in test environment:', error)
  }
}

// Ensure React is available globally for all tests
globalThis.React = React

// Disable React's concurrent features for tests
if (typeof window !== 'undefined') {
  // Force React to use legacy mode in tests
  ;(window as any).__REACT_DISABLE_DEV_WARNINGS__ = true
  ;(window as any).__DISABLE_REACT_CONCURRENT_MODE__ = true
}

// Mock IndexedDB for tests
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import FDBRequest from 'fake-indexeddb/lib/FDBRequest'
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase'
import FDBTransaction from 'fake-indexeddb/lib/FDBTransaction'
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore'
import FDBIndex from 'fake-indexeddb/lib/FDBIndex'
import FDBCursor from 'fake-indexeddb/lib/FDBCursor'

// Setup IndexedDB mocks for both global and window
const indexedDB = new FDBFactory()

global.indexedDB = indexedDB
global.IDBKeyRange = FDBKeyRange
global.IDBRequest = FDBRequest
global.IDBDatabase = FDBDatabase
global.IDBTransaction = FDBTransaction
global.IDBObjectStore = FDBObjectStore
global.IDBIndex = FDBIndex
global.IDBCursor = FDBCursor

// Also set up window.indexedDB for DBManager compatibility
if (typeof window !== 'undefined') {
  window.indexedDB = indexedDB
  window.IDBKeyRange = FDBKeyRange
  window.IDBRequest = FDBRequest
  window.IDBDatabase = FDBDatabase
  window.IDBTransaction = FDBTransaction
  window.IDBObjectStore = FDBObjectStore
  window.IDBIndex = FDBIndex
  window.IDBCursor = FDBCursor
}

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

// Mock Vercel Analytics and Speed Insights
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null
}))

vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => null
}))

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('CRON_SECRET', 'test-cron-secret')
vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account-id')
vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace-id')
vi.stubEnv('CLOUDFLARE_KV_API_TOKEN', 'test-cf-token')

// Mock console methods to avoid test output (preserve original methods)
const originalConsole = { ...console }
global.console = {
  ...originalConsole,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

// matchMedia mock is already set up in __tests__/test-environment.ts
// Removing duplicate definition to avoid conflicts

// matchMedia is already set up in __tests__/test-environment.ts
// Simply ensure it's available on window if needed
if (typeof window !== 'undefined' && typeof global !== 'undefined') {
  // Only set up if missing - trust test-environment.ts implementation
  if (!window.matchMedia && global.matchMedia) {
    window.matchMedia = global.matchMedia
  }
  
  // Additional safety check - if still missing, create a basic mock
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    })
  }
}

// Fix StorageEvent constructor for JSDOM (CI compatibility)
if (typeof window !== 'undefined') {
  if (!window.StorageEvent || typeof window.StorageEvent !== 'function') {
    class StorageEventPolyfill extends Event {
      key: string | null
      newValue: string | null
      oldValue: string | null
      storageArea: Storage | null
      url: string
      
      constructor(type: string, eventInitDict?: StorageEventInit) {
        super(type, eventInitDict)
        this.key = eventInitDict?.key ?? null
        this.newValue = eventInitDict?.newValue ?? null
        this.oldValue = eventInitDict?.oldValue ?? null
        this.storageArea = eventInitDict?.storageArea ?? null
        this.url = eventInitDict?.url ?? ''
      }
    }
    
    window.StorageEvent = StorageEventPolyfill as any
  }
  
  // Set up proper Document constructor for React DOM
  if (!window.Document) {
    window.Document = Document
  }
  
  // Ensure activeElement is properly set
  if (!document.activeElement) {
    Object.defineProperty(document, 'activeElement', {
      writable: true,
      configurable: true,
      value: document.body
    })
  }
}

// Mock Element.scrollTo for JSDOM
if (typeof Element !== 'undefined') {
  Element.prototype.scrollTo = vi.fn()
}

// Mock window.confirm for JSDOM
if (typeof window !== 'undefined') {
  window.confirm = vi.fn(() => true)
  
  // Ensure Document constructor is available
  if (!window.Document && typeof Document !== 'undefined') {
    window.Document = Document
  }
  
  // Navigator mock is already set up in __tests__/test-environment.ts
  // Only ensure it's available on window if missing
  if (!window.navigator && global.navigator) {
    Object.defineProperty(window, 'navigator', {
      value: global.navigator,
      writable: true,
      configurable: true,
      enumerable: true
    })
  }
  
  // Function to set up test environment flags safely
  const setupTestFlags = () => {
    if (typeof window !== 'undefined' && !window.hasOwnProperty('__TEST_ENV__')) {
      // Set test environment flag for MylistButton component
      ;(window as any).__TEST_ENV__ = true
      // Set mock mylist data for MylistOperationsProvider early return
      ;(window as any).__MOCK_MYLIST_DATA__ = {
        mylists: [
          {
            id: 'test-mylist-1',
            name: 'テスト用マイリスト',
            description: 'テスト用',
            isDefault: true,
            videoCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      }
    }
  }
  
  // Set flags initially and provide a way to restore them
  setupTestFlags()
  
  // Make the setup function available globally for tests that need to restore flags
  ;(window as any).__SETUP_TEST_FLAGS__ = setupTestFlags
}

// styled-jsx is now properly installed as a dependency

// Mock Web Streams API for Cloudflare Workers tests
if (typeof global.DecompressionStream === 'undefined') {
  // @ts-ignore
  global.DecompressionStream = class DecompressionStream {
    constructor(format: string) {
      // Mock implementation
    }
  }
}

if (typeof global.CompressionStream === 'undefined') {
  // @ts-ignore
  global.CompressionStream = class CompressionStream {
    constructor(format: string) {
      // Mock implementation
    }
  }
}

// Mock CSS modules - Using individual mock approach for CI compatibility
// The wildcard pattern doesn't work reliably in CI environment

// CSS modules mock removed - using individual mocks in test files for CI compatibility
// The wildcard pattern doesn't work reliably in CI environment

// Standard React Testing Library cleanup
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Uncomment below for debugging test setup issues
// console.log('[vitest.setup.ts] Imports completed, proceeding with configuration')

// Use default React Testing Library configuration
import { configure } from '@testing-library/react'
configure({ 
  testIdAttribute: 'data-testid',
  // Disable concurrent features for tests to avoid conflicts
  // This prevents "Should not already be working" errors
  reactStrictMode: false,
  // Disable act warnings
  // @ts-ignore
  unstable_advanceTimersWrapper: (cb: any) => cb(),
  // @ts-ignore
  asyncWrapper: async (cb: any) => cb()
})

// Careful cleanup after each test to avoid React concurrent mode conflicts
afterEach(() => {
  // Clear timers and mocks first
  vi.clearAllTimers()
  vi.clearAllMocks()
  
  // Synchronous cleanup without act() to avoid concurrent mode issues
  cleanup()
  
  // Manual DOM cleanup as backup
  if (typeof document !== 'undefined') {
    if (document.body) {
      document.body.innerHTML = ''
    }
    if (document.head) {
      document.head.innerHTML = ''
    }
  }
  
  // Reset IndexedDB state
  if (global.indexedDB) {
    try {
      global.indexedDB = new FDBFactory()
    } catch (e) {
      // Ignore IndexedDB cleanup errors
    }
  }
  
  // Reset window object properties
  if (typeof window !== 'undefined') {
    // Navigator mock is handled by __tests__/test-environment.ts
    // Only restore if it's missing
    if (!window.navigator && global.navigator) {
      Object.defineProperty(window, 'navigator', {
        value: global.navigator,
        writable: true,
        configurable: true,
        enumerable: true
      })
    }
  }
})

// Set up test environment before each test
beforeEach(() => {
  // Reset any global state
  vi.clearAllMocks()
  vi.clearAllTimers()
  
  // Ensure test flags are set
  if (typeof window !== 'undefined' && (window as any).__SETUP_TEST_FLAGS__) {
    (window as any).__SETUP_TEST_FLAGS__()
  }
})

// Global CSS modules mocks for mylist components
vi.mock('@/components/mylist-modal.module.css', () => ({
  default: {
    overlay: 'overlay',
    modal: 'modal',
    header: 'header',
    title: 'title',
    closeButton: 'closeButton',
    navigationSection: 'navigationSection',
    navigationLink: 'navigationLink',
    content: 'content',
    mylistItem: 'mylistItem',
    selected: 'selected',
    mylistIcon: 'mylistIcon',
    mylistInfo: 'mylistInfo',
    mylistName: 'mylistName',
    mylistMeta: 'mylistMeta',
    footer: 'footer',
    primaryButton: 'primaryButton',
    secondaryButton: 'secondaryButton',
    newForm: 'newForm',
    input: 'input',
    textarea: 'textarea',
    formButtons: 'formButtons'
  }
}))

// Global mock for MylistOperations context - CI compatibility
// Enforced mock to prevent undefined returns in CI environment
vi.mock('@/context/mylist-operations-context', () => {
  const createMockOperations = () => ({
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  })
  
  const mockUseMylistOperations = vi.fn(() => createMockOperations())
  
  // Ensure mock never returns undefined by setting a fallback
  mockUseMylistOperations.mockImplementation(() => {
    const ops = createMockOperations()
    if (!ops) {
      console.warn('[Test] Mock operations fallback triggered')
      return createMockOperations()
    }
    return ops
  })
  
  return {
    useMylistOperations: mockUseMylistOperations,
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

// Uncomment below for debugging test setup issues
// console.log('[vitest.setup.ts] END - Setup completed successfully')