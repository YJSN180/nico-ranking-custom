import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

// Mock global fetch
global.fetch = vi.fn()

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

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response)

    const Component = await Home()
    render(Component)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('First Video')).toBeInTheDocument()
    expect(screen.getByText('100,000 回再生')).toBeInTheDocument()

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Second Video')).toBeInTheDocument()
    expect(screen.getByText('50,000 回再生')).toBeInTheDocument()

    const firstLink = screen.getByRole('link', { name: /First Video/i })
    expect(firstLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm123')
    expect(firstLink).toHaveAttribute('target', '_blank')
    expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('should render empty state when API returns error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as Response)

    const Component = await Home()
    render(Component)

    expect(screen.getByText('ランキングデータがありません')).toBeInTheDocument()
  })

  it('should render empty state when no data', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const Component = await Home()
    render(Component)

    expect(screen.getByText('ランキングデータがありません')).toBeInTheDocument()
  })
})