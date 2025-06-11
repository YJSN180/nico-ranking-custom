#!/usr/bin/env npx tsx
// APIレスポンスから人気タグの状態を確認

async function testAPIPopularTags() {
  console.log('=== APIレスポンスの人気タグ確認 ===\n')

  const baseUrl = 'https://nico-ranking-new.vercel.app/api/ranking'
  const genres = ['game', 'entertainment', 'technology', 'anime', 'other']
  const periods = ['24h', 'hour'] as const

  for (const genre of genres) {
    console.log(`\n[${genre}ジャンル]`)
    
    for (const period of periods) {
      console.log(`\n  ${period}:`)
      
      try {
        const url = `${baseUrl}?genre=${genre}&period=${period}`
        const response = await fetch(url)
        
        if (!response.ok) {
          console.log(`    × HTTPエラー: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        
        // データ構造を確認
        if (data.items && Array.isArray(data.items)) {
          console.log(`    ✓ アイテム数: ${data.items.length}`)
          
          if (data.popularTags && Array.isArray(data.popularTags)) {
            console.log(`    ✓ 人気タグ: ${data.popularTags.length}個`)
            console.log(`      タグ: ${data.popularTags.slice(0, 5).join(', ')}${data.popularTags.length > 5 ? '...' : ''}`)
          } else {
            console.log(`    × 人気タグなし`)
          }
        } else if (Array.isArray(data)) {
          console.log(`    ✓ アイテム数: ${data.length} (配列形式)`)
          console.log(`    × 人気タグなし (配列形式)`)
        } else {
          console.log(`    ? 不明な形式:`, Object.keys(data))
        }
        
      } catch (error) {
        console.log(`    ! エラー:`, error)
      }
    }
  }

  console.log('\n\n=== 完了 ===')
}

testAPIPopularTags().catch(console.error)