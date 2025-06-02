// 本番環境の毎時ランキングの状態を確認

async function checkHourlyStatus() {
  console.log('=== 本番環境の毎時ランキング確認 ===\n')
  
  try {
    // 1. ステータスAPIで確認
    const statusRes = await fetch('https://nico-ranking-custom.vercel.app/api/status')
    const status = await statusRes.json()
    
    console.log('各ジャンルの状態（一部）:')
    const genresToCheck = ['all', 'game', 'other']
    
    for (const genre of genresToCheck) {
      const data = status.genres?.[genre]
      if (data) {
        console.log(`\n${genre}ジャンル:`)
        console.log(`  アイテム数: ${data.itemCount}件`)
        console.log(`  更新時刻: ${data.updatedAt}`)
      }
    }
    
    // 2. 毎時ランキングAPIを直接確認
    console.log('\n\n毎時ランキングAPI確認:')
    
    for (const genre of genresToCheck) {
      const url = `https://nico-ranking-custom.vercel.app/api/ranking?genre=${genre}&period=hour`
      const res = await fetch(url)
      const text = await res.text()
      
      try {
        const data = JSON.parse(text)
        console.log(`\n${genre}ジャンル（毎時）:`)
        console.log(`  アイテム数: ${data.items?.length || 0}件`)
        console.log(`  人気タグ: ${data.popularTags?.length || 0}個`)
        
        if (data.items && data.items.length > 0) {
          console.log(`  1位: ${data.items[0].title}`)
          
          // NGフィルタリングされるはずの投稿者をチェック
          const ngAuthors = ['蠍媛', 'ゴMNT', '地雷姫']
          const foundNgItems = data.items.filter((item: any) => 
            ngAuthors.includes(item.authorName)
          )
          
          if (foundNgItems.length > 0) {
            console.log(`  ⚠️  NGリストの投稿者が含まれています: ${foundNgItems.length}件`)
            foundNgItems.slice(0, 3).forEach((item: any) => {
              console.log(`    - "${item.title}" by ${item.authorName}`)
            })
          } else {
            console.log(`  ✅ NGリストの投稿者は含まれていません`)
          }
        }
      } catch (e) {
        console.log(`  エラー: JSONパース失敗`)
      }
    }
    
    console.log('\n\n=== 診断結果 ===')
    console.log('毎時ランキングのデータが存在するか、NGフィルタリングが機能しているかを確認してください。')
    console.log('もしNGリストの投稿者が含まれている場合は、KVデータが古い可能性があります。')
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkHourlyStatus().catch(console.error)