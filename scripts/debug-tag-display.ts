#!/usr/bin/env npx tsx
import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function debugTagDisplay() {
  console.log('=== タグ表示デバッグ ===\n')
  
  try {
    // 1. 総合ランキングのトップ5動画のタグ情報を取得
    console.log('1. 総合ランキング（24時間）のデータを取得中...')
    const ranking = await fetchRanking('all', null, '24h', 5)
    
    console.log(`\n取得した動画数: ${ranking.items.length}`)
    console.log(`人気タグ: ${ranking.popularTags.join(', ')}\n`)
    
    // 2. 各動画のタグ情報を表示
    console.log('2. 各動画のタグ情報:')
    ranking.items.forEach((item, index) => {
      console.log(`\n[${index + 1}] ${item.title}`)
      console.log(`  ID: ${item.id}`)
      console.log(`  タグ数: ${item.tags?.length || 0}`)
      if (item.tags && item.tags.length > 0) {
        console.log(`  タグ: ${item.tags.join(', ')}`)
      } else {
        console.log(`  タグ: なし`)
      }
    })
    
    // 3. タグが取得できていない動画の確認
    const itemsWithoutTags = ranking.items.filter(item => !item.tags || item.tags.length === 0)
    console.log(`\n3. タグが取得できていない動画: ${itemsWithoutTags.length}件`)
    
    // 4. HTMLからのタグ抽出テスト
    console.log('\n4. HTMLタグ抽出の詳細確認...')
    
    // fetchWithGooglebot関数を直接実装
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    if (!response.ok) {
      console.log(`  HTMLの取得に失敗: ${response.status}`)
      return
    }
    
    const html = await response.text()
    
    // data-video属性の存在確認
    const dataVideoMatches = html.match(/data-video="/g)
    console.log(`  data-video属性の数: ${dataVideoMatches?.length || 0}`)
    
    // サンプルのdata-video内容を表示
    const sampleMatch = html.match(/data-video="([^"]+)"/)
    if (sampleMatch) {
      try {
        const decoded = sampleMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        const data = JSON.parse(decoded)
        console.log('\n  サンプルdata-video内容:')
        console.log(`    ID: ${data.id}`)
        console.log(`    タイトル: ${data.title}`)
        console.log(`    タグ: ${data.tags ? data.tags.join(', ') : 'なし'}`)
      } catch (error) {
        console.log('  data-videoのパースに失敗')
      }
    }
    
    // 5. Snapshot APIの動作確認
    if (itemsWithoutTags.length > 0) {
      console.log('\n5. Snapshot APIでのタグ取得を試行...')
      const { enrichWithSnapshotTagsLight } = await import('../lib/complete-hybrid-scraper')
      try {
        const enrichedItems = await enrichWithSnapshotTagsLight(itemsWithoutTags.slice(0, 3))
        enrichedItems.forEach((item, index) => {
          console.log(`  [${index + 1}] ${item.id}: タグ数 ${item.tags?.length || 0}`)
        })
      } catch (error) {
        console.log('  Snapshot APIエラー:', error)
      }
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

debugTagDisplay()