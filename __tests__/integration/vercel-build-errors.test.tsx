import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'

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
    get: vi.fn(() => ({
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
    }))
  }
}))

vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mocked-inter-font'
  })
}))

describe('Vercel Build Errors', () => {
  it('should have separate viewport export in layout', async () => {
    const { metadata, viewport } = await import('@/app/layout')
    
    // viewport が metadata に含まれていないことを確認
    expect('viewport' in metadata).toBe(false)
    
    // viewport が別のエクスポートとして存在することを確認
    expect(viewport).toBeDefined()
    expect(viewport.width).toBe('device-width')
    expect(viewport.initialScale).toBe(1)
    expect(viewport.maximumScale).toBe(5)
  })

  it('should render ClientPage with useSearchParams inside Suspense', async () => {
    // ClientPage が Suspense boundary 内で useSearchParams を使用できることを確認
    const ClientPageModule = await vi.importActual('@/app/client-page') as any
    const ClientPage = ClientPageModule.default
    const SuspenseWrapperModule = await vi.importActual('@/components/suspense-wrapper') as any
    const { SuspenseWrapper } = SuspenseWrapperModule
    
    const mockData = [{
      rank: 1,
      id: 'sm1',
      title: 'Test Video',
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000
    }]
    
    // Suspense 内でレンダリングできることを確認
    const element = React.createElement(SuspenseWrapper, {
      children: React.createElement(ClientPage, {
        initialData: mockData,
        initialGenre: 'all',
        initialPeriod: '24h'
      })
    })
    
    // エラーなくレンダリングできることを確認
    expect(() => renderToString(element)).not.toThrow()
  })

  it('should not have console statements in production code', async () => {
    // test-300/page.tsx に console.error がないことを確認
    const test300PageContent = await import('fs').then(fs => 
      fs.readFileSync('./app/test-300/page.tsx', 'utf-8')
    )
    
    expect(test300PageContent).not.toContain('console.error')
    expect(test300PageContent).not.toContain('console.log')
  })
})