import dotenv from 'dotenv'
import path from 'path'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData, getNGList } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

// .env.localを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testSingleGenreUpdate() {
  console.log('=== 単一ジャンルの更新テスト（gameジャンル） ===\n')
  
  // 環境変数の確認
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  console.log(`KV環境変数: ${hasKV ? '✅ 設定済み' : '❌ 未設定'}\n`)
  
  if (!hasKV) {
    console.error('KV環境変数が設定されていません。')
    return
  }
  
  try {
    // NGリストの確認
    const ngList = await getNGList()
    console.log('NGリストのサマリー:')
    console.log(`  動画ID: ${ngList.videoIds.length}件`)
    console.log(`  動画タイトル: ${ngList.videoTitles.length}件`)
    console.log(`  投稿者ID: ${ngList.authorIds.length}件`)
    console.log(`  投稿者名: ${ngList.authorNames.length}件`)
    console.log(`  派生動画ID: ${ngList.derivedVideoIds.length}件`)
    console.log(`  合計: ${ngList.videoIds.length + ngList.derivedVideoIds.length}件の動画がブロック対象\n`)
    
    // 具体的なNGリストの内容を表示
    if (ngList.videoIds.length > 0) {
      console.log(`  NGビデオID例: ${ngList.videoIds.slice(0, 3).join(', ')}`)
    }
    if (ngList.authorNames.length > 0) {
      console.log(`  NG投稿者名例: ${ngList.authorNames.slice(0, 3).join(', ')}`)
    }
    console.log('')
    
    const genre = 'other'  // その他ジャンルに変更
    const period = '24h'
    const targetCount = 300
    const allItems: RankingItem[] = []
    let popularTags: string[] = []
    let page = 1
    const maxPages = 5
    let totalRemoved = 0
    
    console.log(`${genre}ジャンルの${period}ランキングを取得中...\n`)
    
    while (allItems.length < targetCount && page <= maxPages) {
      console.log(`ページ${page}を取得中...`)
      const { items: pageItems, popularTags: pageTags } = await scrapeRankingPage(genre, period, undefined, 100, page)
      
      if (page === 1 && pageTags) {
        popularTags = pageTags
        console.log(`  人気タグ: ${popularTags.slice(0, 5).join(', ')}`)
      }
      
      // 変換
      const convertedItems: RankingItem[] = pageItems.map((item): RankingItem => ({
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
      })).filter((item: any) => item.id && item.title)
      
      console.log(`  取得: ${convertedItems.length}件`)
      
      // NGフィルタリング前に具体的な動画を表示
      if (page === 1) {
        console.log('\n  フィルタリング前の動画例:')
        convertedItems.slice(0, 3).forEach(item => {
          console.log(`    - ${item.title} (${item.id}) by ${item.authorName || '不明'}`)
        })
      }
      
      // NGフィルタリング
      const beforeCount = convertedItems.length
      const { items: filteredItems } = await filterRankingData({ items: convertedItems })
      const removedCount = beforeCount - filteredItems.length
      totalRemoved += removedCount
      
      if (removedCount > 0) {
        console.log(`  ⚠️  NGフィルタで${removedCount}件削除`)
        
        // 削除された動画を特定
        const removedItems = convertedItems.filter(item => 
          !filteredItems.find(filtered => filtered.id === item.id)
        )
        removedItems.forEach(item => {
          console.log(`    削除: "${item.title}" (${item.id}) by ${item.authorName}`)
        })
      } else {
        console.log(`  ✅ NGフィルタで削除なし`)
      }
      
      allItems.push(...filteredItems)
      console.log(`  累計: ${allItems.length}件\n`)
      
      page++
      
      if (page <= maxPages && allItems.length < targetCount) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // 最終結果
    const finalItems = allItems.slice(0, targetCount).map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    
    console.log('=== 最終結果 ===')
    console.log(`取得ページ数: ${page - 1}`)
    console.log(`NGフィルタで削除された総数: ${totalRemoved}件`)
    console.log(`最終保存件数: ${finalItems.length}件`)
    
    // KVに保存
    const dataToStore = {
      items: finalItems,
      popularTags,
      updatedAt: new Date().toISOString()
    }
    
    await kv.set(`ranking-${genre}-${period}`, dataToStore, { ex: 3600 })
    await kv.set(`ranking-${genre}`, dataToStore, { ex: 3600 })
    
    console.log('\n✅ KVに保存完了')
    
    // 保存されたデータの確認
    const savedData = await kv.get(`ranking-${genre}-${period}`) as any
    console.log(`\n保存確認: ${savedData?.items?.length || 0}件のデータがKVに保存されています`)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

testSingleGenreUpdate().catch(console.error)