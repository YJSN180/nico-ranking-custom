#!/usr/bin/env tsx

// ニコニコ動画のトップページから実際のジャンルリストを取得
async function extractGenresFromAPI() {
  console.log('=== ニコニコ動画の実際のジャンル一覧を取得 ===\n')
  
  // まず総合ページを取得してserver-responseを確認
  const response = await fetch('https://www.nicovideo.jp/ranking', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
  
  const html = await response.text()
  
  // server-responseメタタグを探す
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    console.error('server-responseメタタグが見つかりません')
    
    // 代わりにHTMLから直接抽出を試みる
    console.log('HTMLから直接ジャンルリストを探索...\n')
    
    // genre-listやRankingGenreListから抽出
    const genreListPattern = /href="\/ranking\/genre\/([^?"]+)"[^>]*>([^<]+)</g
    const genres: Array<{id: string, label: string}> = []
    let match
    
    while ((match = genreListPattern.exec(html)) !== null) {
      const id = match[1]
      const label = match[2].trim()
      
      // 重複を避ける
      if (!genres.find(g => g.id === id) && id !== 'all' && label) {
        genres.push({ id, label })
      }
    }
    
    if (genres.length > 0) {
      console.log(`見つかったジャンル数: ${genres.length}\n`)
      
      genres.forEach((genre, index) => {
        console.log(`${index + 1}. ${genre.label}: ${genre.id}`)
      })
      
      // TypeScript用マッピング生成
      console.log('\n=== 正しいGENRE_ID_MAP ===\n')
      console.log('export const GENRE_ID_MAP: Record<RankingGenre, string> = {')
      console.log("  all: 'all',")
      
      genres.forEach(genre => {
        let key = ''
        switch (genre.label) {
          case 'エンタメ': key = 'entertainment'; break
          case 'ラジオ': key = 'radio'; break
          case '音楽・サウンド': key = 'music'; break
          case '歌ってみた': key = 'sing'; break
          case '演奏してみた': key = 'play'; break
          case '踊ってみた': key = 'dance'; break
          case 'VOCALOID': key = 'vocaloid'; break
          case 'ニコニコインディーズ': key = 'nicoindies'; break
          case '動物': key = 'animal'; break
          case '料理': key = 'cooking'; break
          case '自然': key = 'nature'; break
          case '旅行・アウトドア': key = 'travel'; break
          case 'スポーツ': key = 'sports'; break
          case '社会・政治・時事': key = 'society'; break
          case '科学・技術': key = 'technology'; break
          case 'ニコニコ手芸部': key = 'handcraft'; break
          case '解説・講座': key = 'commentary'; break
          case 'アニメ': key = 'anime'; break
          case 'ゲーム': key = 'game'; break
          case 'その他': key = 'other'; break
          case 'R-18': key = 'r18'; break
          case 'オリジナル': key = 'original'; break
          default: key = genre.label.toLowerCase()
        }
        
        if (key) {
          console.log(`  ${key}: '${genre.id}',`)
        }
      })
      
      console.log('}')
    }
    
    return
  }
  
  const encodedData = metaMatch[1]!
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
  
  const jsonData = JSON.parse(decodedData)
  
  // ジャンルリストを探す
  console.log('server-responseデータを解析中...')
  
  // データ構造を確認
  if (jsonData?.data?.featuredContents?.genreRanking) {
    const genreData = jsonData.data.featuredContents.genreRanking
    console.log('\ngenreRankingデータ:', JSON.stringify(genreData, null, 2))
  }
}

extractGenresFromAPI().catch(console.error)