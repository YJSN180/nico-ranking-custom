#!/usr/bin/env tsx

// 「その他」ジャンルで「例のソレ」系タグをテスト

async function testExampleTagsInOther() {
  console.log('=== 「その他」ジャンルで「例のソレ」系タグをテスト ===')
  
  const genreId = 'ramuboyn' // その他ジャンル
  
  // 「例のソレ」系の代表的なタグ
  const exampleTags = [
    '例のアレ',
    'クッキー☆',
    'BB先輩シリーズ',
    '淫夢',
    'ホモと見るシリーズ',
    '真夏の夜の淫夢',
    'biim兄貴',
    'RTA'
  ]
  
  for (const tag of exampleTags) {
    console.log(`\n=== 「${tag}」タグのテスト ===`)
    
    const testUrl = `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(tag)}`
    console.log(`URL: ${testUrl}`)
    
    try {
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: testUrl,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja',
            'Cookie': 'sensitive_material_status=accept',
          }
        }),
      })

      if (!response.ok) {
        console.log(`✗ HTTPエラー: ${response.status}`)
        continue
      }

      const proxyData = await response.json()
      const html = proxyData.body
      
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const encodedData = metaMatch[1]!
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        
        const jsonData = JSON.parse(decodedData)
        const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
        
        if (rankingData) {
          console.log(`✓ レスポンス取得成功`)
          console.log(`  ラベル: ${rankingData.label || '不明'}`)
          console.log(`  タグ設定: ${rankingData.tag || 'なし'}`)
          console.log(`  アイテム数: ${rankingData.items?.length || 0}`)
          
          if (rankingData.items && rankingData.items.length > 0) {
            console.log(`  上位3件:`)
            rankingData.items.slice(0, 3).forEach((item: any, index: number) => {
              console.log(`    ${index + 1}位: ${item.title}`)
            })
            
            // タグ関連性の確認
            const tagRelatedCount = rankingData.items.filter((item: any) => 
              item.title?.includes(tag) ||
              item.title?.includes('拓也') ||
              item.title?.includes('BB') ||
              item.title?.includes('先輩') ||
              item.title?.includes('淫夢') ||
              item.title?.includes('ホモ') ||
              item.title?.includes('クッキー') ||
              item.title?.includes('例のアレ') ||
              item.title?.includes('biim') ||
              item.title?.includes('RTA')
            ).length
            
            console.log(`  関連動画: ${tagRelatedCount}/${rankingData.items.length} (${Math.round(tagRelatedCount/rankingData.items.length*100)}%)`)
          }
          
          // タグが正しく設定されているかチェック
          const hasCorrectTag = rankingData.tag === tag
          const isSuccessful = hasCorrectTag && rankingData.items?.length > 0
          
          console.log(`  🎯 成功: ${isSuccessful ? 'YES' : 'NO'}`)
          
          if (isSuccessful) {
            console.log(`\n📊 「${tag}」タグの詳細動画情報 (上位5位):`)
            
            rankingData.items.slice(0, 5).forEach((item: any, index: number) => {
              console.log(`\n${index + 1}位: ${item.title}`)
              console.log(`  動画ID: ${item.id}`)
              console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
              console.log(`  コメント: ${item.count?.comment?.toLocaleString() || '不明'}件`)
              console.log(`  マイリスト: ${item.count?.mylist?.toLocaleString() || '不明'}件`)
              console.log(`  いいね: ${item.count?.like?.toLocaleString() || '不明'}件`)
              console.log(`  投稿者: ${item.owner?.name || '不明'}`)
              console.log(`  投稿日: ${item.registeredAt || '不明'}`)
              console.log(`  サムネイル: ${item.thumbnail?.largeUrl || item.thumbnail?.url || '不明'}`)
            })
          }
        }
      }
      
    } catch (error) {
      console.log(`✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  
  console.log('\n=== まとめ ===')
  console.log('「その他」ジャンル（ramuboyn）で利用可能なタグ:')
  console.log('✅ 拓也さん (前回確認済み)')
  console.log('✅ 替え歌拓也 (前回確認済み)')  
  console.log('✅ 変態糞親父 (前回確認済み)')
  console.log('✅ インタビューシリーズ (前回確認済み)')
  console.log('')
  console.log('今回の結果により「例のソレ」系タグの対応状況が判明します。')
}

testExampleTagsInOther().catch(console.error)