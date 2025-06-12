import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import HomePage from '@/app/page'
import Test300Page from '@/app/test-300/page'

// モックの設定
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: vi.fn(() => new URLSearchParams())
}))

vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(() => null)
  }
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    updatePreferences: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: [],
    addToNGList: vi.fn(),
    removeFromNGList: vi.fn(),
    filterItems: (items: any[]) => items,
    isLoading: false
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  })
}))

// fetch のモック
global.fetch = vi.fn(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      items: [{
        rank: 1,
        id: 'sm1',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 10,
        mylists: 5,
        likes: 20
      }],
      popularTags: ['tag1', 'tag2']
    })
  } as Response)
)

describe('Suspense Boundary in Pages', () => {
  it('should render HomePage with Suspense boundary', async () => {
    const searchParams = { genre: 'all', period: '24h' }
    
    // HomePage は Server Component なので、async でレンダリング
    const element = await HomePage({ searchParams })
    
    // element が React Element であることを確認
    expect(element).toBeTruthy()
    expect(element.type).toBe('main')
  })

  it('should render Test300Page with Suspense boundary', async () => {
    // Test300Page も Server Component
    const element = await Test300Page()
    
    // element が React Element であることを確認
    expect(element).toBeTruthy()
    expect(element.type).toBe('div')
  })
})