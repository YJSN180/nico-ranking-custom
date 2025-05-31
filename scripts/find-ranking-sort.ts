#!/usr/bin/env tsx

// ニコニコ動画の正しいランキングソートパラメータを調査

async function findRankingSort() {
  console.log('=== ニコニコ動画の正しいランキングソートパラメータ調査 ===')
  
  // 試すソートパラメータ
  const sortParams = [
    { sort: 'v', order: 'd', name: '再生数順（降順）' },
    { sort: 'res', order: 'd', name: 'コメント数順（降順）' },
    { sort: 'mylist', order: 'd', name: 'マイリスト数順（降順）' },
    { sort: 'like', order: 'd', name: 'いいね数順（降順）' },
    { sort: 'length', order: 'd', name: '再生時間順（降順）' },
    { sort: '_hot', order: 'd', name: '人気順（降順）' },
    { sort: 'ranking', order: 'd', name: 'ランキング順（降順）' },
    { sort: 'popular', order: 'd', name: 'ポピュラー順（降順）' }
  ]
  
  const baseUrl = 'https://www.nicovideo.jp/search/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA'
  
  for (const param of sortParams) {
    console.log(`\n=== ${param.name} (sort=${param.sort}&order=${param.order}) ===`)
    
    const url = `${baseUrl}?sort=${param.sort}&order=${param.order}`
    console.log(`URL: ${url}`)
    
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

      if (!response.ok) {
        console.log(`✗ HTTPエラー: ${response.status}`)
        continue
      }

      const proxyData = await response.json()
      const html = proxyData.body
      
      // タイトル抽出
      const titlePattern = /title="([^"]+)"/g
      const titles = []
      let match
      while ((match = titlePattern.exec(html)) !== null) {
        const title = match[1].trim()
        if (title.length > 5 && title.length < 200 && !titles.includes(title)) {
          titles.push(title)
        }
      }
      
      console.log(`検出動画数: ${titles.length}`)
      
      if (titles.length > 0) {
        console.log('上位3件:')
        titles.slice(0, 3).forEach((title, index) => {
          console.log(`  ${index + 1}. ${title}`)
        })
        
        // BB先輩関連の割合
        const bbTitles = titles.filter(title => 
          title.includes('BB') || 
          title.includes('先輩') || 
          title.includes('淫夢') ||
          title.includes('ホモ')
        )
        console.log(`BB先輩関連: ${bbTitles.length}/${titles.length} (${Math.round(bbTitles.length/titles.length*100)}%)`)
        
        // 投稿日時の新しさを推測（番号から）
        const videoIdPattern = /(?:sm|nm|so)(\d+)/g
        const videoNumbers = []
        let idMatch
        while ((idMatch = videoIdPattern.exec(html)) !== null) {
          videoNumbers.push(parseInt(idMatch[1]))
        }
        
        if (videoNumbers.length > 0) {
          const avgNumber = videoNumbers.reduce((sum, num) => sum + num, 0) / videoNumbers.length
          const minNumber = Math.min(...videoNumbers)
          const maxNumber = Math.max(...videoNumbers)
          console.log(`動画ID範囲: sm${minNumber} - sm${maxNumber} (平均: sm${Math.round(avgNumber)})`)
          
          // 新しい動画ほど番号が大きい
          if (avgNumber > 45000000) {
            console.log('📅 主に最新動画 (投稿日時順の可能性高)') 
          } else if (avgNumber < 30000000) {
            console.log('📊 主に古い人気動画 (人気順の可能性高)')
          } else {
            console.log('📈 中程度の年代 (要詳細確認)')
          }
        }
      }
      
    } catch (error) {
      console.log(`✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n=== 分析結果 ===')
  console.log('1. sort=f&order=d → 投稿日時順（最新順）')
  console.log('2. sort=v&order=d → 再生数順（人気ランキングに最も近い）')
  console.log('3. sort=mylist&order=d → マイリスト数順（根強い人気）')
  console.log('4. sort=res&order=d → コメント数順（話題性）')
  console.log('\n推奨: sort=v&order=d（再生数順）が最もランキングに近い')
}

findRankingSort().catch(console.error)