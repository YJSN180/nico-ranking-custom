import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

// テスト用のモックデータ
const mockItems: RankingItem[] = [
  {
    rank: 1,
    id: 'sm12345',
    title: 'テスト動画1',
    thumbURL: 'https://example.com/thumb1.jpg',
    views: 1000,
    authorId: 'user123',
    authorName: 'テストユーザー'
  },
  {
    rank: 2,
    id: 'sm67890',
    title: 'NGタイトル',
    thumbURL: 'https://example.com/thumb2.jpg',
    views: 2000,
    authorId: 'user456',
    authorName: 'NG投稿者'
  },
  {
    rank: 3,
    id: 'sm11111',
    title: 'テスト動画3',
    thumbURL: 'https://example.com/thumb3.jpg',
    views: 3000,
    authorId: 'user789',
    authorName: '通常ユーザー'
  }
]

async function testNGFiltering() {
  console.log('=== NGフィルタリングのテスト ===\n')
  
  console.log('元のアイテム数:', mockItems.length)
  mockItems.forEach(item => {
    console.log(`  ${item.rank}位: ${item.title} (${item.id}) by ${item.authorName}`)
  })
  
  try {
    // フィルタリングを実行
    const result = await filterRankingData({ items: mockItems })
    
    console.log('\nフィルタリング後のアイテム数:', result.items.length)
    result.items.forEach(item => {
      console.log(`  ${item.rank}位: ${item.title} (${item.id}) by ${item.authorName}`)
    })
    
    console.log('\nフィルタリングされたアイテム数:', mockItems.length - result.items.length)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実際のデータでテスト
async function testWithRealData() {
  console.log('\n\n=== 実際のランキングデータでテスト ===\n')
  
  try {
    const { scrapeRankingPage } = await import('../lib/scraper')
    
    console.log('ゲームジャンルの最初の10件を取得中...')
    const { items: rawItems } = await scrapeRankingPage('game', '24h', undefined, 10)
    
    console.log(`\n取得したアイテム数: ${rawItems.length}`)
    
    // RankingItem型に変換
    const items: RankingItem[] = rawItems.map((item: any) => ({
      rank: item.rank || 0,
      id: item.id || '',
      title: item.title || '',
      thumbURL: item.thumbURL || '',
      views: item.views || 0,
      comments: item.comments,
      mylists: item.mylists,
      likes: item.likes,
      tags: item.tags,
      authorId: item.authorId,
      authorName: item.authorName,
      authorIcon: item.authorIcon,
      registeredAt: item.registeredAt,
    }))
    
    // フィルタリング前
    console.log('\nフィルタリング前:')
    items.forEach(item => {
      console.log(`  ${item.rank}位: ${item.title.substring(0, 50)}... (${item.id})`)
    })
    
    // フィルタリング実行
    const filtered = await filterRankingData({ items })
    
    console.log(`\nフィルタリング後: ${filtered.items.length}件`)
    filtered.items.forEach(item => {
      console.log(`  ${item.rank}位: ${item.title.substring(0, 50)}... (${item.id})`)
    })
    
    const removedCount = items.length - filtered.items.length
    console.log(`\n削除されたアイテム数: ${removedCount}`)
    
  } catch (error) {
    console.error('実データテストエラー:', error)
  }
}

// メイン実行
testNGFiltering()
  .then(() => testWithRealData())
  .catch(console.error)