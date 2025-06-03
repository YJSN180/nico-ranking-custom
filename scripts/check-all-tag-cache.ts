import { kv } from '@vercel/kv'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function checkAllTagCache() {
  console.log('🔍 すべてのタグ別ランキングキャッシュを確認します...\n')
  
  try {
    // KVのすべてのキーを取得
    const allKeys = await kv.keys('ranking-other-*-tag-*')
    console.log(`📊 タグ別ランキングのキー数: ${allKeys.length}件\n`)
    
    if (allKeys.length === 0) {
      console.log('❌ タグ別ランキングのキャッシュが1つも見つかりません')
      
      // 最終更新時刻を確認
      const lastUpdate = await kv.get('last-ranking-update')
      if (lastUpdate) {
        console.log(`\n⏰ 最終更新: ${new Date(lastUpdate as string).toLocaleString('ja-JP')}`)
      }
      
      // その他ジャンルの通常ランキングデータを確認
      const other24h = await kv.get('ranking-other-24h') as any
      const otherHour = await kv.get('ranking-other-hour') as any
      
      console.log('\n📊 「その他」ジャンルの状態:')
      console.log(`  24時間: ${other24h?.items?.length || 0}件`)
      console.log(`  人気タグ: ${other24h?.popularTags?.slice(0, 5).join(', ') || 'なし'}`)
      console.log(`  毎時: ${otherHour?.items?.length || 0}件`)
      console.log(`  人気タグ: ${otherHour?.popularTags?.slice(0, 5).join(', ') || 'なし'}`)
      
      return
    }
    
    // 各キーのデータを確認
    for (const key of allKeys.slice(0, 10)) { // 最初の10個まで
      const data = await kv.get(key) as any[]
      const tagName = decodeURIComponent(key.split('tag-')[1] || '')
      
      console.log(`📌 ${tagName}: ${data?.length || 0}件`)
      
      if (data && data.length > 0) {
        // 重複チェック
        const uniqueIds = new Set(data.map(item => item.id))
        if (uniqueIds.size !== data.length) {
          console.log(`  ⚠️  重複あり！ ユニーク: ${uniqueIds.size}件`)
        }
      }
    }
    
    if (allKeys.length > 10) {
      console.log(`\n... 他 ${allKeys.length - 10} 件のタグ`)
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

checkAllTagCache().catch(console.error)