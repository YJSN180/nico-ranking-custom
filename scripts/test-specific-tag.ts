import { scrapeRankingPage } from '../lib/scraper'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testSpecificTag() {
  console.log('🔍 特定のタグで300件取得できるか確認します...\n')
  
  const genre = 'other'
  const period = '24h'
  const testTags = ['ゲーム', '実況', 'VOICEROID', 'ゆっくり実況プレイ', '例のアレ']
  
  for (const tag of testTags) {
    console.log(`\n📌 タグ「${tag}」のテスト:`)
    
    try {
      let totalCount = 0
      let page = 1
      
      while (page <= 5) {
        const { items } = await scrapeRankingPage(genre, period, tag, 100, page)
        
        if (!items || items.length === 0) {
          break
        }
        
        totalCount += items.length
        console.log(`  ページ${page}: ${items.length}件 (累計: ${totalCount}件)`)
        
        page++
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      console.log(`  → 合計: ${totalCount}件取得可能`)
      
    } catch (error) {
      console.log(`  → エラー: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

testSpecificTag().catch(console.error)