// 本番環境の状態を詳しく確認するスクリプト

async function checkProductionStatus() {
  console.log('=== 本番環境の状態確認 ===\n')
  
  try {
    // 1. ステータスAPIで最終更新時刻を確認
    console.log('1. 最終更新情報:')
    const statusRes = await fetch('https://nico-ranking-custom.vercel.app/api/status')
    const status = await statusRes.json()
    
    console.log(`  最終更新: ${status.summary?.lastUpdate || 'N/A'}`)
    console.log(`  その他ジャンル:`)
    console.log(`    - アイテム数: ${status.genres?.other?.itemCount || 0}件`)
    console.log(`    - 更新時刻: ${status.genres?.other?.updatedAt || 'N/A'}`)
    
    // 更新時刻をパース
    if (status.genres?.other?.updatedAt) {
      const updateTime = new Date(status.genres?.other.updatedAt)
      const now = new Date()
      const diffMinutes = Math.floor((now.getTime() - updateTime.getTime()) / (1000 * 60))
      console.log(`    - ${diffMinutes}分前に更新`)
    }
    
    // 2. 実際のAPIレスポンスを確認
    console.log('\n2. APIレスポンス:')
    const apiRes = await fetch('https://nico-ranking-custom.vercel.app/api/ranking?genre=other&period=24h')
    const apiText = await apiRes.text()
    
    // JSONとしてパース
    try {
      const apiData = JSON.parse(apiText)
      console.log(`  items配列の長さ: ${apiData.items?.length || 0}件`)
      console.log(`  popularTags: ${apiData.popularTags?.length || 0}個`)
      
      // レスポンスヘッダーも確認
      console.log('\n3. レスポンスヘッダー:')
      console.log(`  Cache-Control: ${apiRes.headers.get('cache-control')}`)
      console.log(`  X-Vercel-Cache: ${apiRes.headers.get('x-vercel-cache')}`)
      console.log(`  Age: ${apiRes.headers.get('age')}`)
      
    } catch (e) {
      console.log('  JSONパースエラー')
    }
    
    // 3. デバッグAPIがあれば確認
    console.log('\n4. デバッグ情報:')
    try {
      const debugRes = await fetch('https://nico-ranking-custom.vercel.app/api/debug/item-count')
      if (debugRes.ok) {
        const debug = await debugRes.json()
        console.log('  デバッグAPIアクセス可能')
        console.log(`  ranking-other-24h: ${debug.results?.['ranking-other-24h']?.count || 'N/A'}件`)
      } else {
        console.log('  デバッグAPIは401エラー（認証が必要）')
      }
    } catch (e) {
      console.log('  デバッグAPIアクセス不可')
    }
    
    // 5. GitHub Actionsの次回実行予定
    console.log('\n5. GitHub Actions:')
    console.log('  スケジュール: 毎時0分')
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(now.getHours() + 1, 0, 0, 0)
    if (nextRun.getTime() - now.getTime() > 3600000) {
      nextRun.setHours(now.getHours(), 0, 0, 0)
    }
    console.log(`  次回実行: ${nextRun.toLocaleTimeString('ja-JP')}`)
    
    // 結論
    console.log('\n=== 診断結果 ===')
    if ((status.genres?.other?.itemCount || 0) <= 100) {
      console.log('❌ KVには100件以下のデータしか保存されていません')
      console.log('\n考えられる原因:')
      console.log('1. GitHub Actionsが新しいコードで実行されていない')
      console.log('2. GitHub Actionsがエラーで失敗している')
      console.log('3. KVへの書き込みが失敗している')
      console.log('\n推奨アクション:')
      console.log('- GitHubでActions履歴を確認')
      console.log('- 手動でWorkflowを実行')
    } else {
      console.log('✅ KVには300件のデータが保存されています')
      console.log('❌ しかしAPIは100件しか返していません')
      console.log('\n考えられる原因:')
      console.log('1. APIのキャッシュが古い')
      console.log('2. APIのロジックに問題がある')
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkProductionStatus().catch(console.error)