#!/usr/bin/env tsx

// プロキシサーバーから返される実際のHTMLを確認し、なぜパースが失敗するかを調べる

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

async function debugProxyParsing() {
  console.log('=== プロキシパース問題のデバッグ ===')
  
  // 環境変数を設定（ローカルテスト用）
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  console.log('プロキシ設定:')
  console.log('- VERCEL_URL:', process.env.VERCEL_URL)
  console.log('- INTERNAL_PROXY_KEY:', process.env.INTERNAL_PROXY_KEY)
  
  try {
    console.log('\n=== 総合24時間ランキングのテスト ===')
    
    // 手動でプロキシAPIにリクエストを送信してHTMLを確認
    const proxyUrl = `http://${process.env.VERCEL_URL}/`
    const targetUrl = 'https://www.nicovideo.jp/ranking/genre/all?term=24h'
    
    console.log(`プロキシURL: ${proxyUrl}`)
    console.log(`ターゲットURL: ${targetUrl}`)
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept',
        }
      }),
    })
    
    if (!response.ok) {
      throw new Error(`プロキシリクエスト失敗: ${response.status}`)
    }
    
    const proxyData = await response.json()
    const html = proxyData.body
    
    console.log(`\nプロキシレスポンス:`)
    console.log(`- Status: ${proxyData.status}`)
    console.log(`- HTML length: ${html.length}`)
    
    // meta tag確認
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (metaMatch) {
      console.log('\n✓ Meta tagを発見')
      const metaContent = metaMatch[1]
      console.log(`Meta content length: ${metaContent.length}`)
      console.log(`Meta content start: ${metaContent.substring(0, 200)}...`)
      
      // JSONデコード試行
      const decodedData = metaContent
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
      
      try {
        const jsonData = JSON.parse(decodedData)
        console.log('\n✓ JSON parsing成功')
        console.log('JSON structure:', Object.keys(jsonData))
        
        if (jsonData.data) {
          console.log('data structure:', Object.keys(jsonData.data))
          if (jsonData.data.response) {
            console.log('response structure:', Object.keys(jsonData.data.response))
            if (jsonData.data.response.$getTeibanRanking) {
              console.log('$getTeibanRanking structure:', Object.keys(jsonData.data.response.$getTeibanRanking))
              if (jsonData.data.response.$getTeibanRanking.data) {
                console.log('ranking data structure:', Object.keys(jsonData.data.response.$getTeibanRanking.data))
                if (jsonData.data.response.$getTeibanRanking.data.items) {
                  const items = jsonData.data.response.$getTeibanRanking.data.items
                  console.log(`✓ アイテム数: ${items.length}`)
                  if (items.length > 0) {
                    console.log('最初のアイテム:', JSON.stringify(items[0], null, 2))
                  }
                }
              }
            }
          }
        }
      } catch (parseError) {
        console.error('✗ JSON parsing失敗:', parseError)
        console.log('Decoded content start:', decodedData.substring(0, 500))
      }
    } else {
      console.log('\n✗ Meta tagが見つかりません')
    }
    
    // data-video-id確認
    const videoIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
    const videoIds = []
    let match
    while ((match = videoIdPattern.exec(html)) !== null) {
      if (match[1] && !videoIds.includes(match[1])) {
        videoIds.push(match[1])
      }
    }
    console.log(`\ndata-video-id の数: ${videoIds.length}`)
    if (videoIds.length > 0) {
      console.log('最初の3つ:', videoIds.slice(0, 3))
    }
    
    // proxy-scraperのテスト
    console.log('\n=== proxy-scraperのテスト ===')
    const result = await scrapeRankingViaProxy('all', '24h')
    console.log(`取得アイテム数: ${result.items.length}`)
    console.log(`人気タグ数: ${result.popularTags?.length || 0}`)
    
    if (result.items.length > 0) {
      console.log('最初のアイテム:', JSON.stringify(result.items[0], null, 2))
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
debugProxyParsing().catch(error => {
  console.error('デバッグ実行エラー:', error)
  process.exit(1)
})