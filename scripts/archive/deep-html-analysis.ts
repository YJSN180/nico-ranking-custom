// HTMLの構造を詳細に解析して例のソレジャンルの手がかりを探す

async function analyzeHtmlStructure() {
  console.log('=== 例のソレジャンルHTML構造解析 ===\n')
  
  // 実際のブラウザセッションから取得したCookieを使用
  const cookie = 'sensitive_material_status=accept; user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6'
  
  console.log('1. 例のソレジャンルに直接アクセス')
  const response1 = await fetch('https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Cookie': cookie,
      'Referer': 'https://www.nicovideo.jp/ranking',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin'
    }
  })
  
  console.log(`Status: ${response1.status}`)
  const html = await response1.text()
  
  // 1. JavaScriptの初期化コードを探す
  console.log('\n2. JavaScript初期化コードを探索')
  const scriptMatches = html.matchAll(/<script[^>]*>([^<]+)<\/script>/g)
  let foundDataCount = 0
  
  for (const match of scriptMatches) {
    const scriptContent = match[1]
    
    // 重要なデータ構造を探す
    if (scriptContent.includes('d2um7mc4') || 
        scriptContent.includes('例のソレ') || 
        scriptContent.includes('immoral') ||
        scriptContent.includes('sensitive')) {
      foundDataCount++
      console.log(`\n📌 関連スクリプト #${foundDataCount}:`)
      console.log(scriptContent.substring(0, 200) + '...')
      
      // データを保存
      if (foundDataCount === 1) {
        const fs = await import('fs')
        fs.writeFileSync('reisore-script-data.js', scriptContent)
        console.log('💾 スクリプトデータを保存しました')
      }
    }
  }
  
  // 2. data属性を持つ要素を探す
  console.log('\n3. data属性の解析')
  const dataAttributes = html.matchAll(/data-([a-z-]+)="([^"]+)"/g)
  const relevantData = new Map<string, string>()
  
  for (const match of dataAttributes) {
    const [_, attrName, attrValue] = match
    if (attrValue.includes('d2um7mc4') || 
        attrValue.includes('immoral') ||
        attrName.includes('genre') ||
        attrName.includes('sensitive')) {
      relevantData.set(attrName, attrValue)
    }
  }
  
  if (relevantData.size > 0) {
    console.log('発見したdata属性:')
    relevantData.forEach((value, key) => {
      console.log(`- data-${key}: ${value.substring(0, 100)}...`)
    })
  }
  
  // 3. URLパターンを探す
  console.log('\n4. URLパターンの探索')
  const urlPatterns = html.matchAll(/https?:\/\/[^"'\s]+d2um7mc4[^"'\s]*/g)
  const foundUrls = new Set<string>()
  
  for (const match of urlPatterns) {
    foundUrls.add(match[0])
  }
  
  if (foundUrls.size > 0) {
    console.log('d2um7mc4を含むURL:')
    foundUrls.forEach(url => console.log(`- ${url}`))
  }
  
  // 4. 特定のクラス名やIDを探す
  console.log('\n5. 特定のクラス/IDパターン')
  const patterns = [
    /class="[^"]*immoral[^"]*"/g,
    /class="[^"]*sensitive[^"]*"/g,
    /class="[^"]*adult[^"]*"/g,
    /id="[^"]*genre[^"]*"/g
  ]
  
  patterns.forEach(pattern => {
    const matches = html.matchAll(pattern)
    for (const match of matches) {
      console.log(`発見: ${match[0]}`)
    }
  })
  
  // 5. 隠しフィールドやフォームを探す
  console.log('\n6. 隠しフィールドの探索')
  const hiddenInputs = html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)
  
  for (const match of hiddenInputs) {
    if (match[0].includes('genre') || match[0].includes('d2um7mc4')) {
      console.log(`隠しフィールド: ${match[0]}`)
    }
  }
  
  // 6. コメントを探す
  console.log('\n7. HTMLコメントの探索')
  const comments = html.matchAll(/<!--([^-]+)-->/g)
  
  for (const match of comments) {
    const comment = match[1]
    if (comment.includes('genre') || comment.includes('sensitive')) {
      console.log(`コメント: ${comment}`)
    }
  }
  
  console.log('\n解析完了')
}

analyzeHtmlStructure().catch(console.error)