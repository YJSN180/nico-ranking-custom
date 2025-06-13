/**
 * レート制限のテストスクリプト
 */

async function testRateLimit() {
  console.log('=== レート制限テスト ===\n')
  
  // テスト対象のエンドポイント
  const endpoints = [
    { path: '/api/ranking', limit: 50, type: 'API' },
    { path: '/', limit: 200, type: 'Page' },
    { path: '/_next/static/test.js', limit: null, type: 'Static Asset' }
  ]
  
  for (const endpoint of endpoints) {
    console.log(`\n${endpoint.type}: ${endpoint.path}`)
    console.log(`制限: ${endpoint.limit ? `${endpoint.limit}リクエスト/分` : '制限なし'}`)
    
    if (endpoint.limit) {
      // 制限を超えるまでリクエストを送信
      const requests = []
      const startTime = Date.now()
      
      // 制限 + 10 リクエストを送信
      for (let i = 0; i < (endpoint.limit + 10); i++) {
        requests.push(
          fetch(`https://nico-rank.com${endpoint.path}`, {
            headers: {
              'X-Test-Request': `${i + 1}`
            }
          }).then(res => ({
            status: res.status,
            rateLimitRemaining: res.headers.get('X-RateLimit-Remaining'),
            retryAfter: res.headers.get('Retry-After')
          })).catch(err => ({
            error: err.message
          }))
        )
        
        // 少し間隔を空ける（DoS攻撃にならないように）
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      const results = await Promise.all(requests)
      const duration = Date.now() - startTime
      
      // 結果の集計
      const successCount = results.filter(r => r.status === 200).length
      const rateLimitedCount = results.filter(r => r.status === 429).length
      const errorCount = results.filter(r => r.error).length
      
      console.log(`\n結果（${duration}ms）:`)
      console.log(`  ✅ 成功: ${successCount}`)
      console.log(`  🚫 レート制限: ${rateLimitedCount}`)
      console.log(`  ❌ エラー: ${errorCount}`)
      
      // 制限が正しく機能しているか確認
      if (successCount <= endpoint.limit && rateLimitedCount > 0) {
        console.log(`  ✅ レート制限が正常に動作しています`)
      } else {
        console.log(`  ⚠️  レート制限が期待通りに動作していない可能性があります`)
      }
      
      // 最後の429レスポンスの詳細
      const lastRateLimited = results.filter(r => r.status === 429).pop()
      if (lastRateLimited) {
        console.log(`  Retry-After: ${lastRateLimited.retryAfter}秒`)
      }
    }
  }
  
  console.log('\n\n注意: このテストは本番環境に負荷をかけます。')
  console.log('開発環境でのテストを推奨します。')
}

// 実行
if (require.main === module) {
  testRateLimit().catch(console.error)
}

export default testRateLimit