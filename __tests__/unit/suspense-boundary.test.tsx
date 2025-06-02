import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import ClientPage from '@/app/client-page'
import { SuspenseWrapper } from '@/components/suspense-wrapper'

// Next.js のモックを設定
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: vi.fn(() => new URLSearchParams())
}))

// カスタムフックのモック
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

describe('Suspense Boundary Error', () => {

  it('should work correctly when wrapped in Suspense boundary', () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm1',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 10,
        mylists: 5,
        likes: 20
      }
    ]

    // Suspense boundary でラップするとエラーにならない
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ClientPage 
          initialData={mockData}
          initialGenre="all"
          initialPeriod="24h"
        />
      </Suspense>
    )

    // コンポーネントが正しくレンダリングされることを確認（初期データが表示される）
    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should work with SuspenseWrapper component', () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm1',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 10,
        mylists: 5,
        likes: 20
      }
    ]

    // SuspenseWrapper でラップしてもエラーにならない
    render(
      <SuspenseWrapper>
        <ClientPage 
          initialData={mockData}
          initialGenre="all"
          initialPeriod="24h"
        />
      </SuspenseWrapper>
    )

    // コンポーネントが正しくレンダリングされることを確認（初期データが表示される）
    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })
})