// 通常版URLで例のソレジャンルを再確認

async function checkD2um7mc4Carefully() {
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD'
  
  console.log('=== 例のソレジャンル MMDタグ 詳細確認 ===')
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    console.log(`Status: ${response.status}`)
    console.log(`Final URL: ${response.url}`)
    
    if (response.status === 200) {
      const html = await response.text()
      console.log(`HTML length: ${html.length}`)
      
      // HTMLを保存
      const fs = await import('fs')
      fs.writeFileSync('d2um7mc4-mmd-response.html', html)
      console.log('💾 HTMLを d2um7mc4-mmd-response.html に保存しました')
      
      // meta server-responseを解析
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const decodedData = metaMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        
        const jsonData = JSON.parse(decodedData)
        const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
        
        console.log(`\nLabel: ${rankingData?.label}`)
        console.log(`Tag: ${rankingData?.tag || 'なし'}`)
        console.log(`Genre: ${rankingData?.genre || 'なし'}`)
        console.log(`FeaturedKey: ${rankingData?.featuredKey || 'なし'}`)
        
        // タグ情報があるか確認
        if (rankingData?.tag) {
          console.log('✅ タグ情報が含まれています！')
        }
        
        // 最終URLが変わっているか確認
        if (response.url !== url) {
          console.log(`\n⚠️ リダイレクトされました:`)
          console.log(`元のURL: ${url}`)
          console.log(`最終URL: ${response.url}`)
        }
        
        // 動画を確認
        if (rankingData?.items?.length > 0) {
          console.log(`\n動画数: ${rankingData.items.length}`)
          console.log('\n最初の5件:')
          rankingData.items.slice(0, 5).forEach((item: any, i: number) => {
            console.log(`${i + 1}. ${item.title} (${item.id})`)
            console.log(`   再生数: ${item.count?.view?.toLocaleString()}`)
            
            // センシティブフラグを確認
            if (item.requireSensitiveMasking) {
              console.log(`   ⚠️ センシティブコンテンツ`)
            }
            
            // 9d091f87フラグ（例のソレ関連？）を確認
            if (item['9d091f87']) {
              console.log(`   🔸 9d091f87フラグ: true`)
            }
          })
        }
        
        // 完全なJSONを保存
        fs.writeFileSync('d2um7mc4-mmd-data.json', JSON.stringify(jsonData, null, 2))
        console.log('\n💾 完全なJSONデータを d2um7mc4-mmd-data.json に保存しました')
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

checkD2um7mc4Carefully().catch(console.error)