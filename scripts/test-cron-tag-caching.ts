import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testTagCaching() {
  console.log('🔧 タグ別ランキングのキャッシュ処理をテストします...\n')
  
  const genre = 'other'
  const period = '24h'
  const tag = '田所浩治(佐倉市)' // テスト用のタグ
  
  try {
    console.log(`📊 タグ「${tag}」のランキングを取得します...`)
    
    const targetCount = 300
    const allTagItems: RankingItem[] = []
    const seenVideoIds = new Set<string>()
    let tagPage = 1
    const maxTagPages = 8
    
    while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
      console.log(`  ページ${tagPage}を取得中...`)
      
      const { items: pageTagItems } = await scrapeRankingPage(genre, period, tag, 100, tagPage)
      console.log(`    取得: ${pageTagItems.length}件`)
      
      const convertedTagItems: RankingItem[] = pageTagItems
        .filter((item): item is RankingItem => 
          item.id !== undefined &&
          item.title !== undefined &&
          item.views !== undefined
        )
        .map((item): RankingItem => ({
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
          registeredAt: item.registeredAt
        }))
      
      console.log(`    変換後: ${convertedTagItems.length}件`)
      
      const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
      console.log(`    NGフィルタリング後: ${filteredTagItems.length}件`)
      
      // 重複を除外しながら追加
      let addedCount = 0
      for (const item of filteredTagItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allTagItems.push(item)
          addedCount++
        }
      }
      console.log(`    新規追加: ${addedCount}件 (重複: ${filteredTagItems.length - addedCount}件)`)
      console.log(`    累計: ${allTagItems.length}件\n`)
      
      tagPage++
      
      // 500msの遅延
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // 300件に切り詰め、ランク番号を振り直す
    const tagRankingItems = allTagItems.slice(0, targetCount).map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    
    console.log(`✅ 最終結果: ${tagRankingItems.length}件のユニークな動画を取得`)
    
    // KVに保存
    const cacheKey = `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
    console.log(`\n💾 KVに保存: ${cacheKey}`)
    await kv.set(cacheKey, tagRankingItems, { ex: 3600 })
    
    // 確認
    const saved = await kv.get(cacheKey) as any[]
    console.log(`✅ 保存確認: ${saved?.length || 0}件`)
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
  }
}

testTagCaching().catch(console.error)