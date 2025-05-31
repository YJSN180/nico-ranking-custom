// Snapshot APIのデバッグスクリプト
async function debugSnapshotAPI() {
  console.log('=== Snapshot API デバッグ ===\n')
  
  const tags = ['R-18', 'MMD']
  
  for (const tag of tags) {
    console.log(`\n--- タグ: ${tag} ---`)
    
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
      `q=${encodeURIComponent(tag)}&` +
      `targets=tagsExact&` +
      `fields=contentId,title,viewCounter,genre,tags&` +
      `_sort=-viewCounter&` +
      `_limit=10`
    
    console.log(`URL: ${url}`)
    
    try {
      const response = await fetch(url)
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`Total hits: ${data.meta?.totalCount || 0}`)
        
        if (data.data && data.data.length > 0) {
          console.log(`\n最初の5件の動画:`)
          data.data.slice(0, 5).forEach((video: any, index: number) => {
            console.log(`${index + 1}. ${video.title}`)
            console.log(`   ID: ${video.contentId}`)
            console.log(`   ジャンル: ${video.genre || 'なし'}`)
            console.log(`   タグ: ${video.tags ? video.tags.slice(0, 5).join(', ') : 'なし'}`)
          })
          
          // ジャンルの統計
          const genreCount: Record<string, number> = {}
          data.data.forEach((video: any) => {
            const genre = video.genre || 'なし'
            genreCount[genre] = (genreCount[genre] || 0) + 1
          })
          
          console.log(`\nジャンル分布:`)
          Object.entries(genreCount).forEach(([genre, count]) => {
            console.log(`  ${genre}: ${count}件`)
          })
        }
      } else {
        const text = await response.text()
        console.log(`Error response: ${text}`)
      }
    } catch (error) {
      console.error(`Error: ${error}`)
    }
  }
}

debugSnapshotAPI().catch(console.error)