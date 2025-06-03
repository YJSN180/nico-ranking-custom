import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function debugGitHubActionsIssue() {
  console.log('🔍 GitHub Actionsで人気タグが3個しかキャッシュされない問題を調査します...\n')
  
  const genre = 'other'
  const period = '24h'
  
  try {
    // 人気タグを取得
    console.log('📊 人気タグを取得中...')
    const { popularTags } = await scrapeRankingPage(genre, period, undefined, 100, 1)
    
    if (!popularTags || popularTags.length === 0) {
      console.log('❌ 人気タグが取得できませんでした')
      return
    }
    
    console.log(`✅ 人気タグ数: ${popularTags.length}件`)
    console.log(`📌 人気タグ一覧:`)
    popularTags.forEach((tag, index) => {
      console.log(`  ${index + 1}. ${tag}`)
    })
    console.log()
    
    // 各タグの処理をシミュレート（最初の5個のみ）
    for (let i = 0; i < Math.min(5, popularTags.length); i++) {
      const tag = popularTags[i]
      console.log(`🏷️  タグ ${i + 1}/5: 「${tag}」`)
      
      try {
        // 最初のページだけ取得してテスト
        const { items: pageItems } = await scrapeRankingPage(genre, period, tag, 100, 1)
        console.log(`  ✅ 1ページ目: ${pageItems.length}件取得`)
        
        // NGフィルタリングテスト
        const convertedItems: RankingItem[] = pageItems
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
        
        const { items: filteredItems } = await filterRankingData({ items: convertedItems })
        console.log(`  ✅ NGフィルタリング後: ${filteredItems.length}件`)
        
        // 2ページ目も試してみる
        try {
          const { items: page2Items } = await scrapeRankingPage(genre, period, tag, 100, 2)
          console.log(`  ✅ 2ページ目: ${page2Items.length}件取得`)
        } catch (page2Error) {
          console.log(`  ⚠️  2ページ目: エラー (${page2Error instanceof Error ? page2Error.message : 'Unknown'})`)
        }
        
        // 処理時間をシミュレート
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (tagError) {
        console.log(`  ❌ エラー: ${tagError instanceof Error ? tagError.message : 'Unknown'}`)
        console.log(`     詳細: ${tagError instanceof Error ? tagError.stack : 'No stack'}`)
        
        // エラーが発生した場合、GitHub Actionsではここで処理が停止する可能性
        console.log('  🚨 このエラーがGitHub Actionsで処理を停止させている可能性があります')
        break
      }
    }
    
    // 現在のキャッシュ状況を確認
    console.log('\n🔍 現在のキャッシュ状況:')
    const allKeys = await kv.keys('ranking-other-24h-tag-*')
    console.log(`  キャッシュされたタグ: ${allKeys.length}件`)
    
    for (const key of allKeys) {
      const tagName = decodeURIComponent(key.split('tag-')[1] || '')
      const data = await kv.get(key) as any[]
      console.log(`  - ${tagName}: ${data?.length || 0}件`)
    }
    
    // 処理されていないタグを特定
    const cachedTags = allKeys.map(key => decodeURIComponent(key.split('tag-')[1] || ''))
    const uncachedTags = popularTags.filter(tag => !cachedTags.includes(tag))
    
    if (uncachedTags.length > 0) {
      console.log(`\n❌ キャッシュされていないタグ (${uncachedTags.length}件):`)
      uncachedTags.forEach((tag, index) => {
        console.log(`  ${index + 1}. ${tag}`)
      })
    }
    
  } catch (error) {
    console.error('❌ メインエラー:', error)
    if (error instanceof Error) {
      console.error('詳細:', error.stack)
    }
  }
}

debugGitHubActionsIssue().catch(console.error)