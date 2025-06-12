import { kv } from '../lib/simple-kv'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testManualTagCache() {
  console.log('🔧 手動でタグ別ランキングキャッシュを作成します...\n')
  
  const genre = 'other'
  const periods = ['24h', 'hour'] as const
  
  // まず人気タグを取得
  console.log('📊 人気タグを取得...')
  const { popularTags } = await scrapeRankingPage(genre, '24h', undefined, 100, 1)
  
  if (!popularTags || popularTags.length === 0) {
    console.log('❌ 人気タグが取得できませんでした')
    return
  }
  
  console.log(`✅ 人気タグ: ${popularTags.slice(0, 5).join(', ')}...`)
  
  // 各期間、各タグでキャッシュを作成
  for (const period of periods) {
    console.log(`\n🕐 期間: ${period}`)
    
    for (let i = 0; i < Math.min(3, popularTags.length); i++) { // 最初の3つのタグのみテスト
      const tag = popularTags[i]
      console.log(`\n  🏷️  タグ「${tag}」を処理中...`)
      
      try {
        const targetTagCount = 300
        const allTagItems: RankingItem[] = []
        const seenTagVideoIds = new Set<string>()
        let tagPage = 1
        const maxTagPages = 8
        
        while (allTagItems.length < targetTagCount && tagPage <= maxTagPages) {
          try {
            console.log(`    ページ${tagPage}を取得中...`)
            const { items: pageTagItems } = await scrapeRankingPage(genre, period, tag, 100, tagPage)
            
            // ページにアイテムがない場合は終了
            if (!pageTagItems || pageTagItems.length === 0) {
              console.log(`    ページ${tagPage}は空です。終了します。`)
              break
            }
            
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
            
            const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
            console.log(`    NGフィルタリング後: ${filteredTagItems.length}件`)
            
            // 重複を除外しながら追加
            let addedCount = 0
            for (const item of filteredTagItems) {
              if (!seenTagVideoIds.has(item.id)) {
                seenTagVideoIds.add(item.id)
                allTagItems.push(item)
                addedCount++
              }
            }
            console.log(`    新規追加: ${addedCount}件 (重複: ${filteredTagItems.length - addedCount}件)`)
            console.log(`    累計: ${allTagItems.length}件`)
            
            tagPage++
            
            // 500msの遅延
            await new Promise(resolve => setTimeout(resolve, 500))
          } catch (pageError) {
            console.log(`    ページ${tagPage}でエラー: ${pageError instanceof Error ? pageError.message : 'Unknown'}`)
            break
          }
        }
        
        // 300件に切り詰め、ランク番号を振り直す
        const tagRankingItems = allTagItems.slice(0, targetTagCount).map((item, index) => ({
          ...item,
          rank: index + 1
        }))
        
        console.log(`  📊 最終結果: ${tagRankingItems.length}件`)
        
        // KVに保存
        const cacheKey = `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
        console.log(`  💾 保存キー: ${cacheKey}`)
        
        await kv.set(cacheKey, tagRankingItems, { ex: 3600 })
        
        // 確認
        const saved = await kv.get(cacheKey) as any[]
        console.log(`  ✅ 保存確認: ${saved?.length || 0}件`)
        
      } catch (tagError) {
        console.error(`  ❌ タグ「${tag}」でエラー:`, tagError)
        if (tagError instanceof Error) {
          console.error(`    詳細: ${tagError.message}`)
          console.error(`    スタック: ${tagError.stack}`)
        }
      }
    }
  }
  
  // 最後に確認
  console.log('\n🔍 作成されたキャッシュを確認...')
  const allKeys = await kv.keys('ranking-other-*-tag-*')
  console.log(`✅ 作成されたタグ別ランキング: ${allKeys.length}件`)
  
  for (const key of allKeys.slice(0, 5)) {
    const data = await kv.get(key) as any[]
    const tagName = decodeURIComponent(key.split('tag-')[1] || '')
    console.log(`  - ${tagName}: ${data?.length || 0}件`)
  }
}

testManualTagCache().catch(console.error)