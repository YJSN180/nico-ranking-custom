import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingItem } from '@/types/ranking'

// モックの設定
vi.mock('next/image', () => ({
  default: vi.fn((props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />
  })
}))

vi.mock('@/hooks/use-mobile-layout', () => ({
  useMobileLayout: () => ({ isNarrow: false, isVeryNarrow: false })
}))

describe('サムネイルクリック機能', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345678',
    title: 'テスト動画',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 10000,
    comments: 100,
    mylists: 50,
    likes: 200,
    authorId: 'user123',
    authorName: 'テストユーザー',
    registeredAt: '2024-06-08T12:00:00+09:00'
  }

  it('デスクトップ版でサムネイルをクリックすると動画ページに遷移する', () => {
    const { container } = render(<RankingItemComponent item={mockItem} isMobile={false} />)
    
    // サムネイルのリンクを探す
    const thumbnailLinks = container.querySelectorAll('a')
    const thumbnailLink = Array.from(thumbnailLinks).find(link => 
      link.querySelector('img[alt="テスト動画"]')
    )
    
    expect(thumbnailLink).toBeTruthy()
    expect(thumbnailLink?.getAttribute('href')).toBe('https://www.nicovideo.jp/watch/sm12345678')
  })

  it('モバイル版でサムネイルをクリックすると動画ページに遷移する', () => {
    const { container } = render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    // サムネイルのリンクを探す
    const thumbnailLinks = container.querySelectorAll('a')
    const thumbnailLink = Array.from(thumbnailLinks).find(link => 
      link.querySelector('img[alt="テスト動画"]')
    )
    
    expect(thumbnailLink).toBeTruthy()
    expect(thumbnailLink?.getAttribute('href')).toBe('https://www.nicovideo.jp/watch/sm12345678')
  })

  it('サムネイルクリック時にsaveRankingStateイベントが発火する', () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const { container } = render(<RankingItemComponent item={mockItem} isMobile={false} />)
    
    // サムネイルのリンクを探す
    const thumbnailLinks = container.querySelectorAll('a')
    const thumbnailLink = Array.from(thumbnailLinks).find(link => 
      link.querySelector('img[alt="テスト動画"]')
    )
    
    expect(thumbnailLink).toBeTruthy()
    fireEvent.click(thumbnailLink!)
    
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'saveRankingState' })
    )
  })
})