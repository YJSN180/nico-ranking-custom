import { kv } from '@vercel/kv'
import dotenv from 'dotenv'
import path from 'path'

// .env.localファイルから環境変数を読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function checkTagRankingData() {
  console.log('🔍 KVに保存されているタグ別ランキングデータを確認します...\n')
  
  try {
    // 「その他」ジャンルの人気タグを確認
    const otherRanking24h = await kv.get('ranking-other-24h') as any
    const otherRankingHour = await kv.get('ranking-other-hour') as any
    
    console.log('📊 「その他」ジャンルの人気タグ:')
    if (otherRanking24h?.popularTags) {
      console.log(`  24時間: ${otherRanking24h.popularTags.slice(0, 10).join(', ')}...`)
    }
    if (otherRankingHour?.popularTags) {
      console.log(`  毎時: ${otherRankingHour.popularTags.slice(0, 10).join(', ')}...`)
    }
    console.log()
    
    // 各タグのデータ件数を確認
    const tagsToCheck = otherRanking24h?.popularTags?.slice(0, 5) || []
    
    for (const tag of tagsToCheck) {
      console.log(`📌 タグ「${tag}」のデータ:`)
      
      // 24時間
      const key24h = `ranking-other-24h-tag-${encodeURIComponent(tag)}`
      const data24h = await kv.get(key24h) as any[]
      
      if (data24h) {
        console.log(`  24時間: ${data24h.length}件`)
        
        // 重複チェック
        const uniqueIds = new Set(data24h.map(item => item.id))
        if (uniqueIds.size !== data24h.length) {
          console.log(`  ⚠️  重複あり！ ユニーク: ${uniqueIds.size}件`)
        }
        
        // 最初と最後のアイテムを表示
        if (data24h.length > 0) {
          console.log(`  最初: "${data24h[0].title}" (${data24h[0].views}再生)`)
          console.log(`  最後: "${data24h[data24h.length - 1].title}" (${data24h[data24h.length - 1].views}再生)`)
        }
      } else {
        console.log(`  24時間: キャッシュなし`)
      }
      
      // 毎時
      const keyHour = `ranking-other-hour-tag-${encodeURIComponent(tag)}`
      const dataHour = await kv.get(keyHour) as any[]
      
      if (dataHour) {
        console.log(`  毎時: ${dataHour.length}件`)
        
        // 重複チェック
        const uniqueIds = new Set(dataHour.map(item => item.id))
        if (uniqueIds.size !== dataHour.length) {
          console.log(`  ⚠️  重複あり！ ユニーク: ${uniqueIds.size}件`)
        }
      } else {
        console.log(`  毎時: キャッシュなし`)
      }
      
      console.log()
    }
    
    // 最終更新時刻を確認
    const lastUpdate = await kv.get('last-ranking-update')
    if (lastUpdate) {
      console.log(`⏰ 最終更新: ${new Date(lastUpdate as string).toLocaleString('ja-JP')}`)
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

checkTagRankingData().catch(console.error)