#!/usr/bin/env tsx

// 現在定義されているジャンルリスト
const CURRENT_GENRES = {
  all: 'all',
  entertainment: 'n8vfxdbi',
  radio: 'oxzi6bje',
  music: 'rr5ucexc',
  sing: 'f37eq4d3',
  play: 'hvcrnqpj',
  dance: 'z4h8e9mj',
  vocaloid: 'zc49b03a',
  nicoindies: 'o8s2vc0m',
  animal: 'ne72lua2',
  cooking: '9gkuqw8q',
  nature: 'l4wy3zaw',
  travel: 'h67gzba0',
  sports: '4w3p65pf',
  society: 'yspx0gpo',
  technology: 'x0nfxivd',
  handcraft: 'x3nkg5o7',
  commentary: 'mfg9v9pa',
  anime: '4eet3ca4',
  game: 'ojnwtgrg',
  other: 'ramuboyn',
  r18: 'r18',
  original: 'v5h6eeiw'
}

async function checkGenre(name: string, id: string) {
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
      return { name, id, status: response.status, valid: false }
    }
    
    const html = await response.text()
    
    // server-responseメタタグを確認
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (!metaMatch) {
      return { name, id, status: 200, valid: false, error: 'No meta tag' }
    }
    
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    
    const jsonData = JSON.parse(decodedData)
    const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
    const trendTags = jsonData?.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags
    
    return {
      name,
      id,
      status: 200,
      valid: true,
      actualGenreId: rankingData?.featuredKey,
      label: rankingData?.label,
      itemCount: rankingData?.items?.length || 0,
      popularTagsCount: trendTags?.length || 0,
      popularTags: trendTags?.slice(0, 5) || []
    }
  } catch (error) {
    return {
      name,
      id,
      status: 0,
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function main() {
  console.log('=== ニコニコ動画 ジャンル検証 ===\n')
  console.log('現在定義されているジャンル数:', Object.keys(CURRENT_GENRES).length)
  console.log('R-18を除いた数:', Object.keys(CURRENT_GENRES).length - 1)
  console.log('\n検証開始...\n')
  
  const results = []
  
  for (const [name, id] of Object.entries(CURRENT_GENRES)) {
    console.log(`Checking ${name} (${id})...`)
    const result = await checkGenre(name, id)
    results.push(result)
    
    if (result.valid) {
      console.log(`✓ ${name}: ${result.label} - ${result.itemCount} items, ${result.popularTagsCount} tags`)
      if (result.popularTags.length > 0) {
        console.log(`  人気タグ: ${result.popularTags.join(', ')}`)
      }
    } else {
      console.log(`✗ ${name}: ${result.error || `HTTP ${result.status}`}`)
    }
    
    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n=== 結果サマリー ===\n')
  
  const validGenres = results.filter(r => r.valid)
  const invalidGenres = results.filter(r => !r.valid)
  
  console.log(`有効なジャンル: ${validGenres.length}`)
  console.log(`無効なジャンル: ${invalidGenres.length}`)
  
  if (invalidGenres.length > 0) {
    console.log('\n無効なジャンル:')
    invalidGenres.forEach(g => {
      console.log(`- ${g.name} (${g.id}): ${g.error || `HTTP ${g.status}`}`)
    })
  }
  
  console.log('\n人気タグが取得できたジャンル:')
  validGenres.filter(g => g.popularTagsCount > 0).forEach(g => {
    console.log(`- ${g.name}: ${g.popularTagsCount} tags`)
  })
  
  // R-18の状態を確認
  const r18Result = results.find(r => r.name === 'r18')
  if (r18Result) {
    console.log('\n=== R-18ジャンルの状態 ===')
    if (r18Result.valid) {
      console.log('R-18は有効なジャンルです')
      console.log(`実際のID: ${r18Result.actualGenreId}`)
      console.log(`ラベル: ${r18Result.label}`)
    } else {
      console.log('R-18は無効なジャンルです')
      console.log(`エラー: ${r18Result.error || `HTTP ${r18Result.status}`}`)
    }
  }
}

if (require.main === module) {
  main().catch(console.error)
}