import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}))

// Mock @vercel/kv
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

// Mock data with enhanced metadata
const mockEnhancedRankingData = [
  {
    rank: 1,
    id: 'sm45026928',
    title: '【Farthest Frontier】領主のお姉さん実況 39【街づくり】',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45026928/45026928.66686887',
    views: 15672,
    comments: 1752,
    mylists: 100,
    likes: 2436,
    uploadDate: '2025-05-27T18:00:00+09:00',
    uploader: {
      name: '領主のお姉さん',
      icon: 'https://example.com/user-icon.jpg'
    }
  },
  {
    rank: 2,
    id: 'sm45027633',
    title: '琴葉茜と月テラフォーミング用の拠点（崖の上） #2【The Planet Crafter 月編】',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45027633/45027633.89193244',
    views: 13704,
    comments: 495,
    mylists: 44,
    likes: 2203,
    uploadDate: '2025-05-27T21:00:00+09:00',
    uploader: {
      name: 'VOICEROID実況者',
      icon: 'https://example.com/user-icon2.jpg'
    }
  }
]

describe('Enhanced UI Components', () => {
  it('should display top 3 rankings with special styling', async () => {
    const { RankingCard } = await import('@/components/RankingCard')
    
    const { container } = render(
      <RankingCard item={mockEnhancedRankingData[0]!} isTop3={true} />
    )
    
    // Top 3 should have special styling
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('ranking-card-top3')
  })

  it('should display all video metadata with icons', async () => {
    const { RankingCard } = await import('@/components/RankingCard')
    
    const { getByText, getByTestId } = render(
      <RankingCard item={mockEnhancedRankingData[0]!} isTop3={false} />
    )
    
    // Check all metadata is displayed
    expect(getByText('15,672')).toBeInTheDocument() // views
    expect(getByText('1,752')).toBeInTheDocument() // comments
    expect(getByText('100')).toBeInTheDocument() // mylists
    expect(getByText('2,436')).toBeInTheDocument() // likes
    
    // Check icons are present
    expect(getByTestId('views-icon')).toBeInTheDocument()
    expect(getByTestId('comments-icon')).toBeInTheDocument()
    expect(getByTestId('mylists-icon')).toBeInTheDocument()
    expect(getByTestId('likes-icon')).toBeInTheDocument()
  })

  it('should display uploader information', async () => {
    const { RankingCard } = await import('@/components/RankingCard')
    
    const { getByText, getByAltText } = render(
      <RankingCard item={mockEnhancedRankingData[0]!} isTop3={false} />
    )
    
    expect(getByText('領主のお姉さん')).toBeInTheDocument()
    expect(getByAltText('領主のお姉さん')).toHaveAttribute('src', 'https://example.com/user-icon.jpg')
  })

  it('should have responsive grid layout', async () => {
    // Mock KV
    const { kv } = await import('@vercel/kv')
    vi.mocked(kv.get).mockResolvedValue(mockEnhancedRankingData)
    
    const EnhancedHome = (await import('@/app/enhanced/page')).default
    
    const { container } = render(await EnhancedHome())
    
    const grid = container.querySelector('.ranking-grid')
    expect(grid).toBeTruthy()
    expect(grid?.className).toContain('responsive-grid')
  })
})