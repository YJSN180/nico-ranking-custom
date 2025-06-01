#!/usr/bin/env tsx

// 「その他」ジャンルの現在の人気タグを使用してセンシティブ動画確認テスト

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

// 「その他」ジャンルの現在の人気タグ（lib/popular-tags.tsから）
const OTHER_GENRE_TAGS = [
  'AIのべりすと',
  '例のアレ',
  '虐待おじさん',
  'BB先輩シリーズ',
  '淫夢',
  '真夏の夜の淫夢',
  'ホモと見るシリーズ',
  'クッキー☆'
]

interface TagTestResult {
  tag: string
  success: boolean
  itemCount: number
  hasSensitive: boolean
  hasTargetSensitive: boolean
  sampleTitles: string[]
  error?: string
  responseTime: number
}

async function testOtherGenreTags(): Promise<void> {
  console.log('=== 「その他」ジャンル × 現在の人気タグテスト ===')
  
  // ローカルテスト用環境変数設定
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  console.log(`\nテスト対象タグ数: ${OTHER_GENRE_TAGS.length}`)
  console.log('タグ一覧:', OTHER_GENRE_TAGS.join(', '))
  
  const results: TagTestResult[] = []
  
  for (const tag of OTHER_GENRE_TAGS) {
    console.log(`\n「その他」 × "${tag}"タグ`)
    
    const startTime = Date.now()
    
    try {
      const result = await scrapeRankingViaProxy('other', '24h', tag)
      const responseTime = Date.now() - startTime
      
      // センシティブコンテンツの検出
      const hasSensitive = result.items.some(item => 
        item.title?.includes('セックス') ||
        item.title?.includes('エロ') ||
        item.title?.includes('淫') ||
        item.title?.includes('sex') ||
        item.title?.includes('ASMR') ||
        item.title?.includes('おっぱい') ||
        item.title?.includes('パンツ') ||
        (item.title && /(?:下着|水着|巨乳|美女|セクシー|エッチ|18禁)/i.test(item.title))
      )
      
      // 特定のセンシティブ動画（機動戦士ガンダム、静電気ドッキリ）の検出
      const hasTargetSensitive = result.items.some(item => 
        (item.title && /(?:機動戦士|グンダム|ガンダム|GQuuuuuuX|ジークアクス|静電気|ドッキリ|タクヤ)/i.test(item.title))
      )
      
      // タグ関連性の確認
      const tagRelated = result.items.some(item => 
        item.title?.includes(tag) ||
        (tag === '淫夢' && item.title?.includes('淫夢')) ||
        (tag === '例のアレ' && item.title?.includes('例のアレ')) ||
        (tag === 'BB先輩シリーズ' && (item.title?.includes('BB') || item.title?.includes('先輩'))) ||
        (tag === 'ホモと見るシリーズ' && (item.title?.includes('ホモ') || item.title?.includes('見る'))) ||
        (tag === 'クッキー☆' && item.title?.includes('クッキー'))
      )
      
      const testResult: TagTestResult = {
        tag,
        success: true,
        itemCount: result.items.length,
        hasSensitive,
        hasTargetSensitive,
        sampleTitles: result.items.slice(0, 5).map(item => item.title || '')
      }
      
      results.push(testResult)
      
      console.log(`  ✓ ${result.items.length}件取得 (${responseTime}ms)`)
      console.log(`  タグ関連性: ${tagRelated ? 'あり' : '不明'}`)
      console.log(`  センシティブ動画: ${hasSensitive ? 'あり' : 'なし'}`)
      console.log(`  ターゲット動画: ${hasTargetSensitive ? 'あり' : 'なし'}`)
      
      if (result.items.length > 0) {
        console.log(`  上位5件:`)
        result.items.slice(0, 5).forEach((item, idx) => {
          console.log(`    ${idx+1}位: ${item.title}`)
        })
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime
      const testResult: TagTestResult = {
        tag,
        success: false,
        itemCount: 0,
        hasSensitive: false,
        hasTargetSensitive: false,
        sampleTitles: [],
        error: String(error),
        responseTime
      }
      
      results.push(testResult)
      console.log(`  ✗ エラー: ${error}`)
    }
    
    // レート制限回避
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('\n=== テスト結果サマリー ===')
  const successCount = results.filter(r => r.success).length
  const sensitiveCount = results.filter(r => r.hasSensitive).length
  const targetSensitiveCount = results.filter(r => r.hasTargetSensitive).length
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
  
  console.log(`成功率: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`)
  console.log(`センシティブ動画検出: ${sensitiveCount}/${successCount} (${successCount > 0 ? Math.round(sensitiveCount/successCount*100) : 0}%)`)
  console.log(`ターゲット動画検出: ${targetSensitiveCount}/${successCount} (${successCount > 0 ? Math.round(targetSensitiveCount/successCount*100) : 0}%)`)
  console.log(`平均応答時間: ${Math.round(avgResponseTime)}ms`)
  
  console.log('\n=== 成功したタグテスト ===')
  results.filter(r => r.success).forEach(result => {
    const status = []
    if (result.hasSensitive) status.push('センシティブあり')
    if (result.hasTargetSensitive) status.push('ターゲット動画あり')
    
    console.log(`✓ "${result.tag}": ${result.itemCount}件 [${status.join(', ') || '通常'}]`)
    console.log(`  代表動画: ${result.sampleTitles[0]}`)
  })
  
  if (targetSensitiveCount > 0) {
    console.log('\n=== ターゲット動画を含むタグテスト ===')
    results.filter(r => r.hasTargetSensitive).forEach(result => {
      const targetTitles = result.sampleTitles.filter(title => 
        /(?:機動戦士|グンダム|ガンダム|GQuuuuuuX|ジークアクス|静電気|ドッキリ|タクヤ)/i.test(title)
      )
      console.log(`✓ "${result.tag}": ${targetTitles[0] || result.sampleTitles[0]}`)
    })
  }
  
  console.log('\n=== 失敗したタグテスト ===')
  const failedResults = results.filter(r => !r.success)
  if (failedResults.length > 0) {
    failedResults.forEach(result => {
      console.log(`✗ "${result.tag}": ${result.error}`)
    })
  } else {
    console.log('すべてのタグテストが成功しました！')
  }
  
  console.log('\n=== 人気タグ設定について ===')
  console.log('現在の「その他」ジャンルの人気タグは以下の通りです:')
  OTHER_GENRE_TAGS.forEach((tag, index) => {
    console.log(`${index + 1}. ${tag}`)
  })
  console.log('\n人気タグの変更は lib/popular-tags.ts の other 配列を編集してください。')
  console.log('タグの順番は配列の順序で決定されます。')
}

testOtherGenreTags().catch(console.error)