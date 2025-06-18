#!/usr/bin/env npx tsx

async function extractHtmlSample() {
  console.log('=== HTMLサンプルの抽出 ===\n')
  
  try {
    // HTMLを取得
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
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
    
    // 1. HTMLの構造を調査
    console.log('1. HTMLの基本構造:')
    console.log(`  全体の長さ: ${html.length}文字`)
    
    // titleタグの内容
    const titleMatch = html.match(/<title>(.*?)<\/title>/)
    if (titleMatch) {
      console.log(`  タイトル: ${titleMatch[1]}`)
    }
    
    // 2. Next.jsのデータ構造を探す
    console.log('\n2. Next.js関連の構造:')
    
    // __NEXT_DATA__を探す
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)
    if (nextDataMatch) {
      console.log('  __NEXT_DATA__が見つかりました')
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        console.log(`  ページタイプ: ${nextData.page}`)
        if (nextData.props?.pageProps) {
          console.log('  pagePropsキー:', Object.keys(nextData.props.pageProps))
        }
      } catch (error) {
        console.log('  __NEXT_DATA__のパースに失敗')
      }
    }
    
    // 3. ランキングデータの痕跡を探す
    console.log('\n3. ランキング関連の文字列検索:')
    
    // 既知の動画IDを検索
    const knownVideoId = 'sm2667147'
    const videoIdIndex = html.indexOf(knownVideoId)
    if (videoIdIndex !== -1) {
      console.log(`  動画ID "${knownVideoId}" が見つかりました（位置: ${videoIdIndex}）`)
      // 前後200文字を表示
      const start = Math.max(0, videoIdIndex - 200)
      const end = Math.min(html.length, videoIdIndex + 200)
      console.log('\n  前後のコンテキスト:')
      console.log(html.substring(start, end).replace(/\n/g, ' '))
    }
    
    // 4. タグ関連の文字列を探す
    console.log('\n\n4. タグ関連の文字列パターン:')
    
    const tagPatterns = [
      'tags":',
      'tag=',
      'Tag',
      'タグ',
      'popular',
      'trend'
    ]
    
    tagPatterns.forEach(pattern => {
      const count = (html.match(new RegExp(pattern, 'gi')) || []).length
      if (count > 0) {
        console.log(`  "${pattern}": ${count}回出現`)
        
        // 最初の出現箇所のコンテキストを表示
        const index = html.toLowerCase().indexOf(pattern.toLowerCase())
        if (index !== -1) {
          const start = Math.max(0, index - 50)
          const end = Math.min(html.length, index + 100)
          console.log(`    サンプル: ${html.substring(start, end).replace(/\n/g, ' ')}`)
        }
      }
    })
    
    // 5. HTMLファイルとして保存（デバッグ用）
    console.log('\n5. HTMLをファイルに保存...')
    const fs = await import('fs/promises')
    const path = await import('path')
    
    const tmpDir = path.join(process.cwd(), 'tmp')
    await fs.mkdir(tmpDir, { recursive: true })
    
    const outputPath = path.join(tmpDir, 'ranking-page.html')
    await fs.writeFile(outputPath, html)
    console.log(`  保存先: ${outputPath}`)
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

extractHtmlSample()