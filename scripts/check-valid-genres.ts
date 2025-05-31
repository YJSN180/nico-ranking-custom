// 有効なジャンルIDを確認
async function checkValidGenres() {
  console.log('=== 有効なジャンルID確認 ===\n')
  
  const genres = [
    { id: 'all', name: '総合' },
    { id: 'hot-topic', name: '話題' },
    { id: 'entertainment', name: 'エンターテイメント' },
    { id: 'radio', name: 'ラジオ' },
    { id: 'music_sound', name: '音楽・サウンド' },
    { id: 'dance', name: 'ダンス' },
    { id: 'play', name: 'ゲーム' },
    { id: 'anime', name: 'アニメ' },
    { id: 'nature', name: '自然' },
    { id: 'cooking', name: '料理' },
    { id: 'animal', name: '動物' },
    { id: 'technology', name: '技術・工作' },
    { id: 'handcraft', name: '手芸・工作' },
    { id: 'history', name: '歴史' },
    { id: 'science', name: '科学' },
    { id: 'travel_outdoor', name: '旅行・アウトドア' },
    { id: 'sports', name: 'スポーツ' },
    { id: 'society_politics_news', name: '社会・政治・時事' },
    { id: 'r18', name: 'R-18' },
    { id: 'other', name: 'その他' },
    { id: 'd2um7mc4', name: '例のソレ' },
    { id: 'ramuboyn', name: 'その他（古いID）' }
  ]
  
  for (const genre of genres) {
    console.log(`\nチェック中: ${genre.name} (${genre.id})`)
    
    const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre.id}?term=24h`
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.meta?.status === 200) {
          console.log(`  ✅ 有効 - ${data.data?.items?.length || 0}件のアイテム`)
        } else {
          console.log(`  ❌ エラー - ステータス: ${data.meta?.status}`)
        }
      } else {
        console.log(`  ❌ HTTPエラー - ${response.status}`)
      }
    } catch (error) {
      console.log(`  ❌ リクエストエラー - ${error}`)
    }
  }
}

checkValidGenres().catch(console.error)