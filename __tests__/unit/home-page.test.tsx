import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
  },
}))

// Mock global fetch
global.fetch = vi.fn()

import { kv } from '@vercel/kv'

describe('Home Page', () => {
  it('should render ranking items correctly', async () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm123',
        title: 'First Video',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/123/123.jpg',
        views: 100000,
      },
      {
        rank: 2,
        id: 'sm456',
        title: 'Second Video',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/456/456.jpg',
        views: 50000,
      },
    ]

    vi.mocked(kv.get).mockResolvedValueOnce(mockData)

    const Component = await Home()
    render(Component)

    expect(screen.getByText('1位')).toBeInTheDocument()
    expect(screen.getByText('First Video')).toBeInTheDocument()
    expect(screen.getByText('100,000 回再生')).toBeInTheDocument()

    expect(screen.getByText('2位')).toBeInTheDocument()
    expect(screen.getByText('Second Video')).toBeInTheDocument()
    expect(screen.getByText('50,000 回再生')).toBeInTheDocument()

    const firstLink = screen.getByRole('link', { name: /First Video/i })
    expect(firstLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm123')
    expect(firstLink).toHaveAttribute('target', '_blank')
    expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('should render error message when data fetch fails', async () => {
    vi.mocked(kv.get).mockRejectedValueOnce(new Error('Failed'))
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('fetch failed'))

    const Component = await Home()
    render(Component)

    expect(screen.getByText('データを準備しています')).toBeInTheDocument()
    expect(screen.getByText('ランキングデータは毎日12時に更新されます。')).toBeInTheDocument()
  })

  it('should render empty state when no data', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const Component = await Home()
    render(Component)

    expect(screen.getByText('ランキングデータがありません')).toBeInTheDocument()
  })
})