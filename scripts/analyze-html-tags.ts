#!/usr/bin/env npx tsx
import { JSDOM } from 'jsdom'

async function analyzeHtmlTags() {
  console.log('=== HTML構造とタグ情報の分析 ===\n')
  
  try {
    // HTMLを取得
    console.log('1. ニコニコ動画のランキングページを取得中...')
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
    console.log(`HTMLサイズ: ${html.length}文字\n`)
    
    // 2. server-responseメタタグの確認
    console.log('2. server-responseメタタグの分析...')
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (metaMatch) {
      try {
        const encodedData = metaMatch[1]
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const serverData = JSON.parse(decodedData)
        const rankingData = serverData.data?.response?.$getTeibanRanking?.data
        
        if (rankingData?.items) {
          console.log(`  ランキングアイテム数: ${rankingData.items.length}`)
          const firstItem = rankingData.items[0]
          console.log(`  最初のアイテム:`)
          console.log(`    ID: ${firstItem.id}`)
          console.log(`    タイトル: ${firstItem.title}`)
          console.log(`    タグ: ${firstItem.tags ? firstItem.tags.join(', ') : 'なし'}`)
        }
      } catch (error) {
        console.log('  server-responseのパースエラー:', error)
      }
    } else {
      console.log('  server-responseメタタグが見つかりません')
    }
    
    // 3. HTMLドキュメント構造の分析
    console.log('\n3. HTML内のランキングアイテム構造...')
    const dom = new JSDOM(html)
    const document = dom.window.document
    
    // 各種要素の数をカウント
    const articles = document.querySelectorAll('article')
    console.log(`  article要素: ${articles.length}個`)
    
    const rankingItems = document.querySelectorAll('[class*="RankingMainItem"], [class*="RankingItem"], .RankingMainItem')
    console.log(`  RankingItem要素: ${rankingItems.length}個`)
    
    // data-video属性の検索
    const dataVideoElements = document.querySelectorAll('[data-video]')
    console.log(`  data-video属性を持つ要素: ${dataVideoElements.length}個`)
    
    // 4. タグ要素の検索
    console.log('\n4. タグ関連要素の検索...')
    const tagLinks = document.querySelectorAll('a[href*="/tag/"]')
    console.log(`  タグリンク: ${tagLinks.length}個`)
    
    // タグクラスを持つ要素
    const tagElements = document.querySelectorAll('[class*="tag"], [class*="Tag"]')
    console.log(`  Tagクラスを持つ要素: ${tagElements.length}個`)
    
    // 5. 特定のセレクタでタグを探す
    console.log('\n5. 特定パターンでのタグ検索...')
    
    // パターン1: span.Tag_label
    const tagLabels = document.querySelectorAll('span.Tag_label')
    console.log(`  span.Tag_label: ${tagLabels.length}個`)
    if (tagLabels.length > 0) {
      console.log('  サンプル:')
      Array.from(tagLabels).slice(0, 3).forEach((label, i) => {
        console.log(`    [${i + 1}] ${label.textContent}`)
      })
    }
    
    // パターン2: PopularTagのリンク
    const popularTagLinks = document.querySelectorAll('.PopularTag a, [class*="PopularTag"] a')
    console.log(`  PopularTagリンク: ${popularTagLinks.length}個`)
    if (popularTagLinks.length > 0) {
      console.log('  サンプル:')
      Array.from(popularTagLinks).slice(0, 3).forEach((link, i) => {
        const href = link.getAttribute('href')
        console.log(`    [${i + 1}] ${link.textContent} (${href})`)
      })
    }
    
    // 6. JSONスクリプトタグの検索
    console.log('\n6. JSONデータを含むscriptタグの検索...')
    const scriptTags = document.querySelectorAll('script[type="application/json"], script[data-json]')
    console.log(`  JSONスクリプトタグ: ${scriptTags.length}個`)
    
    // 7. HTMLの一部をサンプル出力
    console.log('\n7. ランキングアイテムのHTMLサンプル...')
    if (rankingItems.length > 0) {
      const firstItem = rankingItems[0]
      const itemHTML = firstItem.outerHTML
      console.log('  最初のアイテムのHTML（最初の500文字）:')
      console.log(itemHTML.substring(0, 500) + '...')
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

analyzeHtmlTags()