/**
 * Cloudflare Worker をローカルでテストするスクリプト
 */

import { Miniflare } from 'miniflare'
import path from 'path'

async function testWorkerLocally() {
  console.log('=== Cloudflare Worker ローカルテスト ===\n')
  
  // Miniflareインスタンスを作成
  const mf = new Miniflare({
    scriptPath: path.join(__dirname, '../workers/api-gateway-simple.ts'),
    kvNamespaces: ['RATE_LIMIT', 'RANKING_DATA'],
    modules: true,
    compatibilityDate: '2024-01-01',
    bindings: {
      NEXT_APP_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-key',
      RATE_LIMIT: 'RATE_LIMIT',
      RANKING_DATA: 'RANKING_DATA'
    }
  })
  
  // テスト1: レート制限なしのリクエスト
  console.log('テスト1: 通常のリクエスト')
  const response1 = await mf.dispatchFetch('http://localhost/api/ranking', {
    headers: { 'CF-Connecting-IP': '192.168.1.1' }
  })
  console.log(`  ステータス: ${response1.status}`)
  console.log(`  残りリクエスト: ${response1.headers.get('X-RateLimit-Remaining')}`)
  
  // テスト2: レート制限に達するまでリクエスト
  console.log('\nテスト2: レート制限テスト (API: 50req/min)')
  const ip = '192.168.1.2'
  
  for (let i = 0; i < 55; i++) {
    const res = await mf.dispatchFetch('http://localhost/api/ranking', {
      headers: { 'CF-Connecting-IP': ip }
    })
    
    if (res.status === 429) {
      console.log(`  ${i + 1}番目のリクエストでレート制限に到達`)
      console.log(`  Retry-After: ${res.headers.get('Retry-After')}秒`)
      const body = await res.json()
      console.log(`  エラーメッセージ: ${body.message}`)
      break
    }
  }
  
  // テスト3: 静的アセットはレート制限から除外
  console.log('\nテスト3: 静的アセットの確認')
  for (let i = 0; i < 100; i++) {
    await mf.dispatchFetch('http://localhost/_next/static/test.js', {
      headers: { 'CF-Connecting-IP': '192.168.1.3' }
    })
  }
  console.log('  100リクエスト送信完了（レート制限なし）')
  
  // テスト4: 管理APIの厳格な制限
  console.log('\nテスト4: 管理API制限 (20req/min)')
  for (let i = 0; i < 25; i++) {
    const res = await mf.dispatchFetch('http://localhost/api/admin/ng-list', {
      headers: { 'CF-Connecting-IP': '192.168.1.4' }
    })
    
    if (res.status === 429) {
      console.log(`  ${i + 1}番目のリクエストでレート制限に到達`)
      break
    }
  }
  
  // クリーンアップ
  await mf.dispose()
  console.log('\n✅ テスト完了')
}

// 実行
if (require.main === module) {
  testWorkerLocally().catch(console.error)
}

export default testWorkerLocally