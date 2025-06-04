import { vi } from 'vitest'

// Next.js navigation モック
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
    get: vi.fn(),
    toString: vi.fn(() => ''),
  }),
  usePathname: () => '/',
}))

// window.scrollTo モック
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
  window.scrollY = 0
}