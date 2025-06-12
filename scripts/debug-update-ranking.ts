import { kv } from '../lib/simple-kv'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function debugUpdateRanking() {
  console.log('🔧 update-ranking.tsのタグ別ランキング処理をデバッグします...\n')
  
  const genre = 'other'
  const period = '24h'
  
  try {
    // まず通常のランキングを取得して人気タグを確認
    console.log('📊 「その他」ジャンルの通常ランキングを取得...')
    const { items: mainItems, popularTags } = await scrapeRankingPage(genre, period, undefined, 100, 1)
    console.log(`✅ 人気タグ: ${popularTags?.slice(0, 5).join(', ')}...\n`)
    
    if (!popularTags || popularTags.length === 0) {
      console.log('❌ 人気タグが取得できませんでした')
      return
    }
    
    // より人気のあるタグでテスト（ゲーム関連のタグを探す）
    const testTag = popularTags.find(tag => tag.includes('ゲーム') || tag.includes('実況')) || popularTags[0]
    console.log(`🏷️  タグ「${testTag}」のランキングを取得します...`)
    
    const targetTagCount = 300
    const allTagItems: RankingItem[] = []
    const seenTagVideoIds = new Set<string>()
    let tagPage = 1
    const maxTagPages = 8
    
    while (allTagItems.length < targetTagCount && tagPage <= maxTagPages) {
      try {
        console.log(`\n  ページ${tagPage}を取得中...`)
        const { items: pageTagItems } = await scrapeRankingPage(genre, period, testTag, 100, tagPage)
        
        console.log(`  - 取得: ${pageTagItems.length}件`)
        
        // ページにアイテムがない場合は終了
        if (!pageTagItems || pageTagItems.length === 0) {
          console.log('  - ページが空です。終了します。')
          break
        }
        
        const convertedTagItems: RankingItem[] = pageTagItems
          .filter((item): boolean => {
            const isValid = item.id !== undefined && 
                           item.title !== undefined && 
                           item.views !== undefined
            if (!isValid) {
              console.log(`  - 無効なアイテム: id=${item.id}, title=${item.title}, views=${item.views}`)
            }
            return isValid
          })
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
        
        console.log(`  - 変換後: ${convertedTagItems.length}件`)
        
        const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
        console.log(`  - NGフィルタリング後: ${filteredTagItems.length}件`)
        
        // 重複を除外しながら追加
        let addedCount = 0
        for (const item of filteredTagItems) {
          if (!seenTagVideoIds.has(item.id)) {
            seenTagVideoIds.add(item.id)
            allTagItems.push(item)
            addedCount++
          }
        }
        console.log(`  - 新規追加: ${addedCount}件 (重複: ${filteredTagItems.length - addedCount}件)`)
        console.log(`  - 累計: ${allTagItems.length}件`)
        
        tagPage++
        
        // 500msの遅延
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (pageError) {
        console.error(`  ❌ ページ${tagPage}でエラー:`, pageError)
        break
      }
    }
    
    console.log(`\n✅ 最終結果: ${allTagItems.length}件のユニークな動画を取得`)
    
    // 300件に切り詰め、ランク番号を振り直す
    const tagRankingItems = allTagItems.slice(0, targetTagCount).map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    
    // KVに保存
    const cacheKey = `ranking-${genre}-${period}-tag-${encodeURIComponent(testTag)}`
    console.log(`\n💾 KVに保存: ${cacheKey}`)
    await kv.set(cacheKey, tagRankingItems, { ex: 3600 })
    
    // 確認
    const saved = await kv.get(cacheKey) as any[]
    console.log(`✅ 保存確認: ${saved?.length || 0}件`)
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error)
    if (error instanceof Error) {
      console.error('エラーの詳細:', error.stack)
    }
  }
}

debugUpdateRanking().catch(console.error)