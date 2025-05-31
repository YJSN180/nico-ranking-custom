#!/usr/bin/env tsx

// HTMLから直接人気タグボタンをパースして抽出

async function htmlTagParsing() {
  console.log('=== HTMLから人気タグボタンの直接パース ===')
  
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept',
        }
      }),
    })

    const proxyData = await response.json()
    const html = proxyData.body
    
    console.log(`HTMLサイズ: ${html.length}文字`)
    
    // 期待されるタグ（スクリーンショットから修正）
    const expectedTags = ['すべて', 'R-18', '紳士向け', 'MMD', 'ボイロAV']
    
    console.log('\n=== 期待されるタグの検索 ===')
    expectedTags.forEach(tag => {
      const count = (html.match(new RegExp(tag, 'g')) || []).length
      console.log(`「${tag}」: ${count}回出現`)
      
      if (count > 0) {
        // 該当タグの周辺HTMLを確認
        const index = html.indexOf(tag)
        if (index !== -1) {
          const surrounding = html.substring(index - 150, index + 150)
          console.log(`  周辺HTML: ...${surrounding.replace(/\s+/g, ' ')}...`)
        }
      }
    })
    
    console.log('\n=== HTMLタグ構造の詳細分析 ===')
    
    // 1. すべてのbutton要素を抽出
    const buttonMatches = html.match(/<button[^>]*>[\s\S]*?<\/button>/g)
    if (buttonMatches) {
      console.log(`\nbutton要素 (${buttonMatches.length}個):`)
      buttonMatches.forEach((button, index) => {
        // ボタン内のテキストを抽出
        const textMatch = button.match(/>([^<]+)</g)
        if (textMatch) {
          const texts = textMatch.map(t => t.replace(/[><]/g, '')).filter(t => t.trim().length > 0)
          if (texts.length > 0) {
            console.log(`  ${index + 1}. ${button.substring(0, 100)}...`)
            console.log(`     テキスト: ${texts.join(', ')}`)
          }
        }
      })
    }
    
    // 2. タグフィルターエリアを特定
    console.log('\n=== タグフィルターエリアの検索 ===')
    
    // 「すべて」ボタンの周辺を詳細に調査
    const allButtonIndex = html.indexOf('すべて')
    if (allButtonIndex !== -1) {
      console.log(`「すべて」ボタンを発見: 位置 ${allButtonIndex}`)
      
      // 前後500文字を詳細分析
      const section = html.substring(allButtonIndex - 500, allButtonIndex + 500)
      console.log('\n詳細セクション:')
      console.log(section.replace(/\s+/g, ' '))
      
      // この範囲内でボタンやリンクを探す
      const sectionButtons = section.match(/<(?:button|a)[^>]*>[\s\S]*?<\/(?:button|a)>/g)
      if (sectionButtons) {
        console.log(`\nセクション内のボタン/リンク (${sectionButtons.length}個):`)
        sectionButtons.forEach((btn, index) => {
          console.log(`  ${index + 1}. ${btn}`)
        })
      }
    }
    
    // 3. 特定のクラス名やdata属性を持つ要素を検索
    console.log('\n=== 特定属性を持つ要素の検索 ===')
    
    const attributePatterns = [
      /class="[^"]*filter[^"]*"/g,
      /class="[^"]*tab[^"]*"/g,
      /class="[^"]*genre[^"]*"/g,
      /class="[^"]*category[^"]*"/g,
      /data-[^=]*="[^"]*"/g
    ]
    
    attributePatterns.forEach((pattern, index) => {
      const matches = html.match(pattern)
      if (matches) {
        console.log(`\nパターン${index + 1} (${matches.length}個マッチ):`)
        matches.slice(0, 5).forEach(match => {
          console.log(`  - ${match}`)
        })
      }
    })
    
    // 4. JavaScriptで動的に生成される可能性を確認
    console.log('\n=== JavaScript内のタグデータ検索 ===')
    
    const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/g)
    if (scriptTags) {
      console.log(`スクリプトタグ数: ${scriptTags.length}`)
      
      expectedTags.forEach(tag => {
        const foundInScript = scriptTags.some(script => script.includes(tag))
        console.log(`  「${tag}」がJS内に存在: ${foundInScript ? 'YES' : 'NO'}`)
      })
      
      // window.__NUXT__内を詳細確認
      const nuxtScript = scriptTags.find(script => script.includes('__NUXT__'))
      if (nuxtScript) {
        console.log('\nNUXTスクリプト内のタグ:')
        expectedTags.forEach(tag => {
          if (nuxtScript.includes(tag)) {
            const tagIndex = nuxtScript.indexOf(tag)
            const surrounding = nuxtScript.substring(tagIndex - 50, tagIndex + 50)
            console.log(`  「${tag}」: ...${surrounding}...`)
          }
        })
      }
    }
    
    // 5. 実際にHTMLに存在するタグボタンを推測して抽出
    console.log('\n=== 実際のタグボタン抽出試行 ===')
    
    // より広範囲なパターンで検索
    const widePatterns = [
      /<[^>]*>[\s]*すべて[\s]*<\/[^>]*>/g,
      /<[^>]*>[\s]*R-18[\s]*<\/[^>]*>/g,
      /<[^>]*>[\s]*紳士向け[\s]*<\/[^>]*>/g,
      /<[^>]*>[\s]*MMD[\s]*<\/[^>]*>/g,
      /<[^>]*>[\s]*ボイロAV[\s]*<\/[^>]*>/g
    ]
    
    widePatterns.forEach((pattern, index) => {
      const matches = html.match(pattern)
      if (matches) {
        console.log(`\n${expectedTags[index]} パターンマッチ (${matches.length}個):`)
        matches.forEach(match => {
          console.log(`  ${match}`)
        })
      }
    })
    
  } catch (error) {
    console.error('エラー:', error)
  }
  
  console.log('\n=== 結論 ===')
  console.log('1. HTMLから直接タグボタンを抽出する方法を検証')
  console.log('2. 期待されるタグ: すべて, R-18, 紳士向け, MMD, ボイロAV')
  console.log('3. HTMLパース結果に基づいて抽出ロジックを構築')
}

htmlTagParsing().catch(console.error)