#!/usr/bin/env tsx

async function extractGenresFromHTML() {
  const url = 'https://www.nicovideo.jp/ranking'
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
  
  const html = await response.text()
  
  // RankingGenreListItem リンクからジャンルを抽出
  const genrePattern = /<a[^>]+class="[^"]*RankingGenreListItem[^"]*"[^>]*href="\/ranking\/genre\/([^?"]+)[^"]*"[^>]*>([^<]+)</g
  
  const genres = []
  let match
  
  while ((match = genrePattern.exec(html)) !== null) {
    const id = match[1]
    const label = match[2].trim()
    
    if (id && label) {
      genres.push({ id, label })
    }
  }
  
  console.log('=== ニコニコ動画の実際のジャンル一覧 ===\n')
  console.log(`見つかったジャンル数: ${genres.length}\n`)
  
  genres.forEach((genre, index) => {
    console.log(`${index + 1}. ${genre.label}: ${genre.id}`)
  })
  
  // IDマッピングを生成
  console.log('\n=== TypeScript用マッピング ===\n')
  genres.forEach(genre => {
    const key = genre.label
      .replace('エンタメ', 'entertainment')
      .replace('ラジオ', 'radio')
      .replace('音楽・サウンド', 'music')
      .replace('歌ってみた', 'sing')
      .replace('演奏してみた', 'play')
      .replace('踊ってみた', 'dance')
      .replace('VOCALOID', 'vocaloid')
      .replace('ニコニコインディーズ', 'nicoindies')
      .replace('動物', 'animal')
      .replace('料理', 'cooking')
      .replace('自然', 'nature')
      .replace('旅行・アウトドア', 'travel')
      .replace('スポーツ', 'sports')
      .replace('社会・政治・時事', 'society')
      .replace('科学・技術', 'technology')
      .replace('ニコニコ手芸部', 'handcraft')
      .replace('解説・講座', 'commentary')
      .replace('アニメ', 'anime')
      .replace('ゲーム', 'game')
      .replace('その他', 'other')
      .replace('R-18', 'r18')
      .replace('オリジナル', 'original')
      .replace('音合成・AI関連', 'ai')
    
    console.log(`  ${key}: '${genre.id}',`)
  })
}

extractGenresFromHTML().catch(console.error)