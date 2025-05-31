// スナップショットAPIを使って例のソレランキングを作成

async function createReiSoreRanking() {
  console.log('=== スナップショットAPIで例のソレランキング作成 ===\n')
  
  // 例のソレジャンルのタグ
  const reisoreTags = ['R-18', 'ボイロAV', '紳士向け', 'MMD']
  const allVideos: any[] = []
  
  // 各タグから動画を取得
  for (const tag of reisoreTags) {
    console.log(`\n「${tag}」タグを検索中...`)
    
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=${encodeURIComponent(tag)}&targets=tagsExact&fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,lengthSeconds,genre,tags&_sort=-viewCounter&_limit=100`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.data) {
        // 例のソレジャンルの動画のみフィルター
        const reisoreVideos = data.data.filter((video: any) => 
          video.genre === '例のソレ'
        )
        
        console.log(`取得: ${data.data.length}件中、例のソレ: ${reisoreVideos.length}件`)
        allVideos.push(...reisoreVideos)
      }
    } catch (error) {
      console.error(`Error fetching ${tag}:`, error)
    }
  }
  
  // 重複を除去
  const uniqueVideos = Array.from(
    new Map(allVideos.map(v => [v.contentId, v])).values()
  )
  
  console.log(`\n\n合計: ${uniqueVideos.length}件の例のソレ動画`)
  
  // 再生数順（24時間ランキング相当）
  const viewRanking = [...uniqueVideos]
    .sort((a, b) => b.viewCounter - a.viewCounter)
    .slice(0, 30)
  
  console.log('\n=== 例のソレジャンル 再生数ランキング TOP10 ===')
  viewRanking.slice(0, 10).forEach((video, i) => {
    console.log(`${i + 1}位: ${video.title}`)
    console.log(`    ID: ${video.contentId}, 再生: ${video.viewCounter.toLocaleString()}`)
  })
  
  // 投稿時間順（毎時ランキング相当）
  const hourlyRanking = [...uniqueVideos]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 30)
  
  console.log('\n\n=== 例のソレジャンル 毎時ランキング TOP10 ===')
  hourlyRanking.slice(0, 10).forEach((video, i) => {
    console.log(`${i + 1}位: ${video.title}`)
    console.log(`    投稿: ${new Date(video.startTime).toLocaleString('ja-JP')}`)
  })
  
  // データを保存
  const fs = await import('fs')
  const rankingData = {
    genre: '例のソレ',
    genreId: 'd2um7mc4',
    timestamp: new Date().toISOString(),
    viewRanking: viewRanking,
    hourlyRanking: hourlyRanking
  }
  
  fs.writeFileSync('reisore-ranking-snapshot.json', JSON.stringify(rankingData, null, 2))
  console.log('\n\n💾 ランキングデータを保存しました: reisore-ranking-snapshot.json')
  
  return rankingData
}

// 実行
createReiSoreRanking().catch(console.error)