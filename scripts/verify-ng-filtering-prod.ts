// 本番環境でNGフィルタリングが正しく機能しているか詳細確認

async function verifyNGFilteringInProduction() {
  console.log('=== 本番環境NGフィルタリング詳細確認 ===\n')
  
  try {
    // NGリストに含まれる投稿者名
    const knownNGAuthors = ['蠍媛', 'ゴMNT', '地雷姫', 'ほまリニスト', 'ぱぱら快刀', 'くりうくろう', 'アンドリューフォーク大佐', '藤山弘', 'エミヤマシロ', 'カクヤ']
    const knownNGVideoIds = ['sm44246039', 'sm44153447', 'sm44122764', 'sm44081236', 'sm43823468', 'sm44147361']
    
    const genres = ['all', 'game', 'other']
    const periods = ['24h', 'hour']
    
    for (const genre of genres) {
      for (const period of periods) {
        console.log(`\n${genre}ジャンル (${period}):`)
        
        const url = `https://nico-ranking-custom.vercel.app/api/ranking?genre=${genre}&period=${period}`
        const res = await fetch(url)
        const data = await res.json()
        
        if (!data.items || data.items.length === 0) {
          console.log('  データなし')
          continue
        }
        
        console.log(`  総アイテム数: ${data.items.length}件`)
        
        // NGリストの投稿者をチェック
        const foundNGAuthors = data.items.filter((item: any) => 
          knownNGAuthors.includes(item.authorName)
        )
        
        // NGリストの動画IDをチェック
        const foundNGVideos = data.items.filter((item: any) => 
          knownNGVideoIds.includes(item.id)
        )
        
        if (foundNGAuthors.length > 0) {
          console.log(`  ⚠️  NGリストの投稿者が見つかりました: ${foundNGAuthors.length}件`)
          foundNGAuthors.forEach((item: any) => {
            console.log(`    - "${item.title}" (${item.id}) by ${item.authorName}`)
          })
        } else {
          console.log('  ✅ NGリストの投稿者は含まれていません')
        }
        
        if (foundNGVideos.length > 0) {
          console.log(`  ⚠️  NGリストの動画IDが見つかりました: ${foundNGVideos.length}件`)
          foundNGVideos.forEach((item: any) => {
            console.log(`    - "${item.title}" (${item.id})`)
          })
        } else {
          console.log('  ✅ NGリストの動画IDは含まれていません')
        }
        
        // 投稿者名がある動画の統計
        const withAuthor = data.items.filter((item: any) => item.authorName)
        const withoutAuthor = data.items.filter((item: any) => !item.authorName)
        console.log(`  投稿者名あり: ${withAuthor.length}件, なし: ${withoutAuthor.length}件`)
        
        // タイトルに特定のNGワードが含まれているかチェック
        const ngTitlePatterns = ['ほまリニスト卒業', '音量をゼロにして']
        const foundNGTitles = data.items.filter((item: any) => 
          ngTitlePatterns.some(pattern => item.title.includes(pattern))
        )
        
        if (foundNGTitles.length > 0) {
          console.log(`  ⚠️  NGタイトルパターンが見つかりました: ${foundNGTitles.length}件`)
          foundNGTitles.forEach((item: any) => {
            console.log(`    - "${item.title}" (${item.id})`)
          })
        }
      }
    }
    
    console.log('\n\n=== まとめ ===')
    console.log('上記の結果を確認して、NGフィルタリングが正しく機能しているか判断してください。')
    console.log('もし ⚠️ マークがある場合は、NGフィルタリングに問題がある可能性があります。')
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

verifyNGFilteringInProduction().catch(console.error)