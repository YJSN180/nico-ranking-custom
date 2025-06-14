import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingItem from '@/components/ranking-item'
import type { RankingItem as RankingItemType } from '@/types/ranking'

describe('Image CORS Fix', () => {
  const mockItem: RankingItemType = {
    rank: 1,
    id: 'sm12345',
    title: 'Test Video',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45084617/45084617.48974667',
    views: 1000,
    comments: 50,
    mylists: 10,
    likes: 100,
    authorId: 'user123',
    authorName: 'Test User',
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1234.jpg',
    registeredAt: new Date().toISOString()
  }

  it('should render thumbnail images from nicovideo.cdn.nimg.jp', () => {
    render(<RankingItem item={mockItem} />)
    
    const images = screen.getAllByRole('img')
    const thumbnailImage = images.find(img => {
      const src = img.getAttribute('src')
      // Next.js Image component rewrites URLs
      return src?.includes('nicovideo.cdn.nimg.jp') || 
             src?.includes('/_next/image') && src.includes(encodeURIComponent('nicovideo.cdn.nimg.jp'))
    })
    
    expect(thumbnailImage).toBeDefined()
    expect(thumbnailImage?.getAttribute('src')).toContain(encodeURIComponent('nicovideo.cdn.nimg.jp'))
    expect(thumbnailImage?.getAttribute('alt')).toBe(mockItem.title)
  })

  it('should also render author icons from secure-dcdn.cdn.nimg.jp', () => {
    render(<RankingItem item={mockItem} />)
    
    const images = screen.getAllByRole('img')
    const authorIcon = images.find(img => {
      const src = img.getAttribute('src')
      return src?.includes('secure-dcdn.cdn.nimg.jp') || 
             src?.includes('/_next/image') && src.includes(encodeURIComponent('secure-dcdn.cdn.nimg.jp'))
    })
    
    expect(authorIcon).toBeDefined()
    expect(authorIcon?.getAttribute('src')).toContain(encodeURIComponent('secure-dcdn.cdn.nimg.jp'))
  })

  it('should work for mobile layout too', () => {
    render(<RankingItem item={mockItem} isMobile={true} />)
    
    const images = screen.getAllByRole('img')
    const thumbnailImage = images.find(img => {
      const src = img.getAttribute('src')
      return src?.includes('nicovideo.cdn.nimg.jp') || 
             src?.includes('/_next/image') && src.includes(encodeURIComponent('nicovideo.cdn.nimg.jp'))
    })
    
    expect(thumbnailImage).toBeDefined()
    expect(thumbnailImage?.getAttribute('src')).toContain(encodeURIComponent('nicovideo.cdn.nimg.jp'))
  })
})