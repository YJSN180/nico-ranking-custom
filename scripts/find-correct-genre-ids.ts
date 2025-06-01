#!/usr/bin/env tsx

// 既知の正しいジャンルIDと、現在のマッピングを比較して正しいIDを見つける

const KNOWN_WORKING_GENRES = {
  // verify-all-genres.tsの結果から、人気タグが取得できた6ジャンル
  radio: 'oxzi6bje',      // ✓ 人気タグあり
  vocaloid: 'zc49b03a',   // ✓ 人気タグあり
  animal: 'ne72lua2',     // ✓ 人気タグあり
  sports: '4w3p65pf',     // ✓ 人気タグあり
  anime: '4eet3ca4',      // ✓ 人気タグあり
  other: 'ramuboyn',      // ✓ 人気タグあり
}

// 推測される正しいIDパターン
// 多くのIDが8文字の英数字パターンを持つ

async function testGenreId(label: string, id: string) {
  const url = `https://www.nicovideo.jp/ranking/genre/${id}?term=24h`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    if (!response.ok) {
      return { label, id, status: response.status, valid: false }
    }
    
    const html = await response.text()
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    
    if (!metaMatch) {
      return { label, id, status: 200, valid: false, error: 'No meta tag' }
    }
    
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    
    const jsonData = JSON.parse(decodedData)
    const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
    const actualLabel = rankingData?.label
    const trendTags = jsonData?.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags
    
    return {
      label,
      id,
      status: 200,
      valid: true,
      actualLabel,
      isCorrect: actualLabel && actualLabel !== '総合' && actualLabel !== 'すべて',
      hasTags: (trendTags?.length || 0) > 0,
      tagCount: trendTags?.length || 0
    }
  } catch (error) {
    return {
      label,
      id,
      status: 0,
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// 正しいIDを探す候補
const GENRE_CANDIDATES = {
  // 正しいとわかっているもの
  all: ['all'],
  radio: ['oxzi6bje'],
  vocaloid: ['zc49b03a'], 
  animal: ['ne72lua2'],
  sports: ['4w3p65pf'],
  anime: ['4eet3ca4'],
  other: ['ramuboyn'],
  
  // 間違っているもの - 正しいIDを探す必要がある
  entertainment: ['n8vfxdbi', 'dwmcdafs', 'jk8xvqk0', 'entame'],
  music: ['rr5ucexc', 'xwg3xzcc', 'e6jp51ju', 'music'],
  sing: ['f37eq4d3', 'dwq0xqg8', 'yqf4xbif', 'sing'],
  play: ['hvcrnqpj', 'x0kvsej6', 'iab5ackf', 'play'],
  dance: ['z4h8e9mj', 'hjyp0vlw', 'z6xb8tjl', 'dance'],
  nicoindies: ['o8s2vc0m', 'xe6mnc5z', 'rz57ucqp', 'indies'],
  cooking: ['9gkuqw8q', 'ojh5cv2g', 'ggckeabg', 'cooking'],
  nature: ['l4wy3zaw', 'lde54xbj', 'g7er2xhc', 'nature'],
  travel: ['h67gzba0', 'f0q8xzd6', 'z8fm9xmn', 'travel'],
  society: ['yspx0gpo', 'uc9rb5jy', 'szq0tf2c', 'society'],
  technology: ['x0nfxivd', 'ujwu0n76', 'g68dp24f', 'tech', 'technology'],
  handcraft: ['x3nkg5o7', 'w3s17hzj', 'ly6mx0ql', 'make'],
  commentary: ['mfg9v9pa', 'oyfmgkhf', 'fnuxfh9y', 'lecture'],
  game: ['ojnwtgrg', 'o0da4xqg', 'zzxiv6kq', 'game'],
  original: ['v5h6eeiw', 'pcnm5w37', 'h0qfrb5z', 'original'],
  r18: ['r18', 'e9uj2uks', 'hoan0v8d']
}

async function findCorrectGenreIds() {
  console.log('=== 正しいジャンルIDを探索 ===\n')
  
  const results: Record<string, any> = {}
  
  for (const [genre, candidates] of Object.entries(GENRE_CANDIDATES)) {
    console.log(`\n${genre}ジャンルのテスト:`)
    
    for (const id of candidates) {
      const result = await testGenreId(genre, id)
      
      if (result.isCorrect) {
        console.log(`✓ ${id} -> "${result.actualLabel}" (タグ: ${result.tagCount})`)
        results[genre] = {
          id,
          label: result.actualLabel,
          hasTags: result.hasTags
        }
        break
      } else if (result.valid) {
        console.log(`✗ ${id} -> "${result.actualLabel || 'なし'}"`)
      } else {
        console.log(`✗ ${id} -> エラー: ${result.error || result.status}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  console.log('\n\n=== 正しいGENRE_ID_MAP ===\n')
  console.log('export const GENRE_ID_MAP: Record<RankingGenre, string> = {')
  
  const sortedGenres = Object.keys(results).sort()
  sortedGenres.forEach(genre => {
    if (results[genre]) {
      console.log(`  ${genre}: '${results[genre].id}', // ${results[genre].label}`)
    }
  })
  
  console.log('}')
  
  // まだ見つかっていないジャンル
  const missingGenres = Object.keys(GENRE_CANDIDATES).filter(g => !results[g])
  if (missingGenres.length > 0) {
    console.log('\n\n=== まだ正しいIDが見つかっていないジャンル ===')
    missingGenres.forEach(g => console.log(`- ${g}`))
  }
}

if (require.main === module) {
  findCorrectGenreIds().catch(console.error)
}