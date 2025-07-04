import '@testing-library/jest-dom'
import { vi } from 'vitest'
import './__tests__/mocks/next-router'
import React from 'react'

// グローバルCSSをテスト環境でインポート（CSS変数対応）
import './app/globals.css'

// テスト環境でCSS変数のフォールバック定義
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
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
  document.head.appendChild(style)
}

// Ensure React is available globally for all tests
globalThis.React = React

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

// styled-jsx is now properly installed as a dependency

// Mock CSS modules - Using individual mock approach for CI compatibility
// The wildcard pattern doesn't work reliably in CI environment

// CSS modules mock removed - using individual mocks in test files for CI compatibility
// The wildcard pattern doesn't work reliably in CI environment

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