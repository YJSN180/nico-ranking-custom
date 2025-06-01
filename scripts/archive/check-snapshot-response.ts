// Snapshot APIのレスポンスを詳細に確認
async function checkSnapshotResponse() {
  console.log('=== Snapshot API レスポンス確認 ===\n')
  
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
    `q=R-18&` +
    `targets=tagsExact&` +
    `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,genre,tags,userId,userNickname&` +
    `_sort=-viewCounter&` +
    `_limit=3`
  
  console.log(`URL: ${url}\n`)
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    console.log('レスポンス全体:')
    console.log(JSON.stringify(data, null, 2))
    
    if (data.data && data.data.length > 0) {
      console.log('\n\n各動画の詳細:')
      data.data.forEach((video: any, index: number) => {
        console.log(`\n動画 ${index + 1}:`)
        Object.entries(video).forEach(([key, value]) => {
          console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        })
      })
    }
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkSnapshotResponse().catch(console.error)