import { extractServerResponseData } from '../lib/complete-hybrid-scraper'

async function testPageParameter() {
  console.log('=== ニコニコ動画のpage=2, page=3パラメータ検証 ===\n')
  
  // Googlebot UAでジオブロックを回避
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja',
    'Cookie': 'sensitive_material_status=accept'
  }
  
  try {
    // 1. まずpage=1（デフォルト）を確認
    console.log('1. 1ページ目（1-100位）を取得...')
    const page1Response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour', { headers })
    const page1Html = await page1Response.text()
    const page1Data = extractServerResponseData(page1Html)
    const page1Items = page1Data.data?.response?.$getTeibanRanking?.data?.items || []
    console.log(`  取得件数: ${page1Items.length}件`)
    if (page1Items.length > 0) {
      console.log(`  最初の動画: ${page1Items[0].title}`)
      console.log(`  最後の動画: ${page1Items[page1Items.length - 1].title}`)
    }
    
    // 2. page=2を試す
    console.log('\n2. 2ページ目（101-200位）を取得...')
    const page2Response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=2', { headers })
    const page2Html = await page2Response.text()
    
    // server-responseメタタグが存在するか確認
    const hasServerResponse2 = page2Html.includes('<meta name="server-response"')
    console.log(`  server-responseメタタグ: ${hasServerResponse2 ? '✅ あり' : '❌ なし'}`)
    
    if (hasServerResponse2) {
      const page2Data = extractServerResponseData(page2Html)
      const page2Items = page2Data.data?.response?.$getTeibanRanking?.data?.items || []
      console.log(`  取得件数: ${page2Items.length}件`)
      if (page2Items.length > 0) {
        console.log(`  最初の動画: ${page2Items[0].title}`)
        console.log(`  最後の動画: ${page2Items[page2Items.length - 1].title}`)
        
        // 重複チェック
        const isDuplicate = page1Items.some(item1 => 
          page2Items.some(item2 => item2.id === item1.id)
        )
        console.log(`  1ページ目との重複: ${isDuplicate ? '⚠️ あり' : '✅ なし'}`)
      }
    }
    
    // 3. page=3を試す
    console.log('\n3. 3ページ目（201-300位）を取得...')
    const page3Response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=3', { headers })
    const page3Html = await page3Response.text()
    
    const hasServerResponse3 = page3Html.includes('<meta name="server-response"')
    console.log(`  server-responseメタタグ: ${hasServerResponse3 ? '✅ あり' : '❌ なし'}`)
    
    if (hasServerResponse3) {
      const page3Data = extractServerResponseData(page3Html)
      const page3Items = page3Data.data?.response?.$getTeibanRanking?.data?.items || []
      console.log(`  取得件数: ${page3Items.length}件`)
      if (page3Items.length > 0) {
        console.log(`  最初の動画: ${page3Items[0].title}`)
        console.log(`  最後の動画: ${page3Items[page3Items.length - 1].title}`)
      }
    }
    
    // 4. 別のジャンルでも確認
    console.log('\n4. 総合ジャンル（all）でも確認...')
    const allPage2Response = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h&page=2', { headers })
    const allPage2Html = await allPage2Response.text()
    const hasAllPage2 = allPage2Html.includes('<meta name="server-response"')
    console.log(`  総合ジャンルpage=2: ${hasAllPage2 ? '✅ 存在' : '❌ 存在しない'}`)
    
    // 5. ページ内のランキング番号を確認
    console.log('\n5. HTMLに表示されているランキング番号を確認...')
    const rankPattern = /<span[^>]*class="[^"]*RankingNumber[^"]*"[^>]*>(\d+)</g
    let match
    const ranks: number[] = []
    while ((match = rankPattern.exec(page2Html)) !== null) {
      ranks.push(parseInt(match[1]))
    }
    if (ranks.length > 0) {
      console.log(`  page=2の順位範囲: ${Math.min(...ranks)}位 〜 ${Math.max(...ranks)}位`)
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
testPageParameter().then(() => {
  console.log('\n=== 検証完了 ===')
})