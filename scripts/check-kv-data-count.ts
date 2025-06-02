import { kv } from '@vercel/kv'

async function checkKVDataCount() {
  console.log('=== KVに保存されているデータ件数を確認 ===\n')
  
  const genres = ['all', 'game', 'entertainment', 'music', 'other']
  const periods = ['24h', 'hour']
  
  for (const genre of genres) {
    for (const period of periods) {
      const key = `ranking-${genre}-${period}`
      
      try {
        const data = await kv.get(key) as any
        
        if (data && data.items) {
          console.log(`${key}: ${data.items.length}件`)
          
          if (data.items.length > 100) {
            console.log(`  ✅ 100件以上保存されています！`)
            console.log(`  1位: ${data.items[0]?.title}`)
            console.log(`  100位: ${data.items[99]?.title}`)
            console.log(`  101位: ${data.items[100]?.title || 'なし'}`)
            console.log(`  最後: ${data.items[data.items.length - 1]?.title}`)
          }
          
          if (data.popularTags && data.popularTags.length > 0) {
            console.log(`  人気タグ: ${data.popularTags.slice(0, 5).join(', ')}`)
          }
        } else {
          console.log(`${key}: データなし`)
        }
      } catch (error) {
        console.log(`${key}: エラー - ${error}`)
      }
      
      console.log('')
    }
  }
  
  // 最終更新情報も確認
  const updateInfo = await kv.get('last-update-info') as any
  if (updateInfo) {
    console.log('\n最終更新情報:')
    console.log(`  更新日時: ${updateInfo.timestamp}`)
    console.log(`  ソース: ${updateInfo.source}`)
    console.log(`  成功: ${updateInfo.allSuccess}`)
  }
}

checkKVDataCount().catch(console.error)