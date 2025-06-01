import { extractServerResponseData } from '../lib/complete-hybrid-scraper'

async function analyzePageStructure() {
  console.log('=== ページ構造の詳細分析 ===\n')
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja',
    'Cookie': 'sensitive_material_status=accept'
  }
  
  try {
    // page=2のHTMLを取得して分析
    console.log('その他ジャンル毎時ランキング page=2 を分析...')
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=2', { headers })
    const html = await response.text()
    
    // 1. server-responseのデータ構造を確認
    const serverData = extractServerResponseData(html)
    console.log('\n1. server-responseデータ構造:')
    console.log('  キー:', Object.keys(serverData.data?.response || {}))
    
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data
    if (rankingData) {
      console.log('  ランキングデータのキー:', Object.keys(rankingData))
      console.log('  items数:', rankingData.items?.length)
      console.log('  label:', rankingData.label)
      console.log('  term:', rankingData.term)
      console.log('  page情報:', rankingData.page || 'なし')
      console.log('  offset情報:', rankingData.offset || 'なし')
    }
    
    // 2. HTMLから実際に表示されているランキング番号を抽出
    console.log('\n2. HTML内のランキング番号:')
    
    // より広範なパターンでランキング番号を探す
    const patterns = [
      /<span[^>]*class="[^"]*RankingNumber[^"]*"[^>]*>(\d+)</g,
      /<div[^>]*class="[^"]*rank[^"]*"[^>]*>(\d+)</g,
      /data-rank="(\d+)"/g,
      />(\d{1,3})位</g
    ]
    
    const allRanks = new Set<number>()
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const rank = parseInt(match[1])
        if (rank >= 1 && rank <= 300) {
          allRanks.add(rank)
        }
      }
    }
    
    const ranks = Array.from(allRanks).sort((a, b) => a - b)
    if (ranks.length > 0) {
      console.log(`  見つかった順位: ${ranks.slice(0, 5).join(', ')}${ranks.length > 5 ? '...' : ''}`)
      console.log(`  順位範囲: ${Math.min(...ranks)}位 〜 ${Math.max(...ranks)}位`)
      console.log(`  順位の数: ${ranks.length}個`)
    } else {
      console.log('  順位番号が見つかりませんでした')
    }
    
    // 3. 動画IDの重複を確認
    console.log('\n3. 各ページの動画IDを比較:')
    
    // page=1のデータ
    const page1Response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour', { headers })
    const page1Html = await page1Response.text()
    const page1Data = extractServerResponseData(page1Html)
    const page1Items = page1Data.data?.response?.$getTeibanRanking?.data?.items || []
    const page1Ids = new Set(page1Items.map((item: any) => item.id))
    
    // page=2のデータ
    const page2Items = rankingData?.items || []
    const page2Ids = new Set(page2Items.map((item: any) => item.id))
    
    console.log(`  page=1の動画数: ${page1Ids.size}`)
    console.log(`  page=2の動画数: ${page2Ids.size}`)
    
    // 重複をチェック
    const duplicates = [...page2Ids].filter(id => page1Ids.has(id))
    console.log(`  重複している動画数: ${duplicates.length}`)
    
    if (duplicates.length > 0 && duplicates.length === page2Ids.size) {
      console.log('  ⚠️ page=2のデータは完全にpage=1と同じです')
    }
    
    // 4. URLパラメータの影響を確認
    console.log('\n4. 異なるpageパラメータでのレスポンス:')
    for (const page of [1, 2, 3, 10]) {
      const url = `https://www.nicovideo.jp/ranking/genre/other?term=hour&page=${page}`
      const resp = await fetch(url, { headers })
      const html = await resp.text()
      const data = extractServerResponseData(html)
      const items = data.data?.response?.$getTeibanRanking?.data?.items || []
      console.log(`  page=${page}: ${items.length}件`)
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
analyzePageStructure().then(() => {
  console.log('\n=== 分析完了 ===')
})