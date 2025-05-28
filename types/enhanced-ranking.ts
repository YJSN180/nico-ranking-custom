export interface EnhancedRankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments: number
  mylists: number
  likes: number
  uploadDate: string
  uploader: {
    name: string
    id: string
  }
  duration?: string
  tags?: string[]
}

export type EnhancedRankingData = EnhancedRankingItem[]

// Mock data generator helper
export function enhanceRankingItemWithMockData(item: import('./ranking').RankingItem): EnhancedRankingItem {
  // Generate consistent mock data based on video ID
  const seed = item.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  return {
    ...item,
    comments: Math.floor(seed * 12.7) % 5000 + 100,
    mylists: Math.floor(seed * 8.3) % 1000 + 50,
    likes: Math.floor(seed * 15.1) % 2000 + 200,
    uploadDate: new Date(Date.now() - (seed % 30) * 24 * 60 * 60 * 1000).toISOString(),
    uploader: {
      name: `投稿者${(seed % 999) + 1}`,
      id: `user${seed % 999999}`
    },
    duration: `${Math.floor(seed % 20) + 1}:${String(seed % 60).padStart(2, '0')}`,
    tags: [`タグ${seed % 100}`, `カテゴリ${seed % 50}`, `ジャンル${seed % 25}`]
  }
}