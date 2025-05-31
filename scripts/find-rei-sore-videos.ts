// 例のソレ動画を検索するデバッグスクリプト
async function findReiSoreVideos() {
  console.log('=== 例のソレ動画検索 ===\n')
  
  const tags = ['R-18', 'ボイロAV', '紳士向け', 'MMD', 'エロゲ', '巨乳', 'R18MMD']
  let foundVideos = 0
  
  for (const tag of tags) {
    console.log(`\nタグ「${tag}」で検索中...`)
    
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
      `q=${encodeURIComponent(tag)}&` +
      `targets=tagsExact&` +
      `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,genre,tags,userId,userNickname&` +
      `_sort=-viewCounter&` +
      `_limit=50`
    
    try {
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        
        if (data.data) {
          // ジャンルでフィルタリング
          const reisoreVideos = data.data.filter((video: any) => 
            video.genre === '例のソレ' || video.genre === 'rei-sore' || video.genre === 'その他'
          )
          
          if (reisoreVideos.length > 0) {
            console.log(`  見つかった動画数: ${reisoreVideos.length}件`)
            console.log(`  ジャンル分布:`)
            const genres = new Set(reisoreVideos.map((v: any) => v.genre))
            genres.forEach(g => {
              const count = reisoreVideos.filter((v: any) => v.genre === g).length
              console.log(`    ${g}: ${count}件`)
            })
            
            // 最初の動画を表示
            const first = reisoreVideos[0]
            console.log(`  例: ${first.title}`)
            console.log(`      ジャンル: ${first.genre}`)
            console.log(`      再生数: ${first.viewCounter}`)
            
            foundVideos += reisoreVideos.length
          } else {
            console.log(`  例のソレジャンルの動画は見つかりませんでした`)
            
            // 全ジャンルの分布を表示
            const genreCount: Record<string, number> = {}
            data.data.slice(0, 10).forEach((video: any) => {
              const genre = video.genre || 'なし'
              genreCount[genre] = (genreCount[genre] || 0) + 1
            })
            
            console.log(`  ジャンル分布（上位10件）:`)
            Object.entries(genreCount).forEach(([genre, count]) => {
              console.log(`    ${genre}: ${count}件`)
            })
          }
        }
      }
    } catch (error) {
      console.error(`エラー: ${error}`)
    }
  }
  
  console.log(`\n合計で見つかった例のソレ動画: ${foundVideos}件`)
}

findReiSoreVideos().catch(console.error)