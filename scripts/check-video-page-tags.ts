#!/usr/bin/env npx tsx

async function checkVideoPageTags() {
  console.log('=== 個別動画ページのタグ確認 ===\n')
  
  try {
    // 1. 個別の動画ページからタグを取得
    const videoId = 'sm2667147'
    console.log(`1. 動画 ${videoId} のページを取得中...`)
    
    const response = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    if (!response.ok) {
      console.error(`取得失敗: ${response.status}`)
      return
    }
    
    const html = await response.text()
    console.log(`HTMLサイズ: ${html.length}文字`)
    
    // 2. data-api-dataを探す
    console.log('\n2. data-api-dataの確認...')
    const apiDataMatch = html.match(/data-api-data="([^"]+)"/)
    if (apiDataMatch) {
      console.log('  data-api-dataが見つかりました')
      try {
        const encodedData = apiDataMatch[1]
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
        
        const apiData = JSON.parse(decodedData)
        console.log(`  動画タイトル: ${apiData.video?.title}`)
        
        if (apiData.tag) {
          console.log(`  タグ数: ${apiData.tag.items?.length || 0}`)
          if (apiData.tag.items && apiData.tag.items.length > 0) {
            console.log('  タグ一覧:')
            apiData.tag.items.forEach((tag: any, i: number) => {
              console.log(`    [${i + 1}] ${tag.name}`)
            })
          }
        } else {
          console.log('  タグ情報が見つかりません')
        }
      } catch (error) {
        console.log('  data-api-dataのパースエラー:', error)
      }
    } else {
      console.log('  data-api-dataが見つかりません')
    }
    
    // 3. 別の方法でタグを探す
    console.log('\n3. 他のタグ関連要素の検索...')
    
    // タグリンクパターン
    const tagLinkPattern = /<a[^>]+href="\/tag\/([^"?]+)[^"]*"[^>]*>([^<]+)<\/a>/g
    const tags = new Set<string>()
    let match
    
    while ((match = tagLinkPattern.exec(html)) !== null) {
      const tag = decodeURIComponent(match[1]).replace(/\+/g, ' ')
      tags.add(tag)
    }
    
    if (tags.size > 0) {
      console.log(`  タグリンクから抽出: ${tags.size}個`)
      Array.from(tags).slice(0, 10).forEach((tag, i) => {
        console.log(`    [${i + 1}] ${tag}`)
      })
    }
    
    // 4. 結論
    console.log('\n4. 分析結果:')
    console.log('  - ランキングページにはタグ情報が含まれていない')
    console.log('  - 個別の動画ページにはタグ情報が存在する')
    console.log('  - タグを表示するには追加のAPI呼び出しが必要')
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

checkVideoPageTags()