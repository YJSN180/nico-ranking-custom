#!/usr/bin/env tsx

// loaderDataの深層構造を徹底的に解析

async function deepDiveLoaderData() {
  console.log('=== loaderData深層構造の徹底解析 ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  // 例のソレジャンルで詳細解析
  const url = 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?redirected=1'
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: url,
        headers: fullHeaders
      }),
    })

    const proxyData = await response.json()
    
    if (proxyData.status === 200) {
      const html = proxyData.body
      console.log(`HTMLサイズ: ${html.length.toLocaleString()}文字`)
      
      // Remixコンテキスト全体を詳細に解析
      const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
      if (remixMatch) {
        console.log(`✅ Remixコンテキスト発見`)
        
        try {
          const remixDataStr = remixMatch[1]
          const remixData = JSON.parse(remixDataStr)
          
          // 詳細なJSON構造を出力（デバッグ用）
          console.log('\n=== Remix Context 完全出力 ===')
          console.log(JSON.stringify(remixData, null, 2))
          
          // loaderDataの各ルートを個別に解析
          const loaderData = remixData.state?.loaderData
          
          if (loaderData) {
            console.log('\n=== LoaderData 各ルート詳細解析 ===')
            
            // routes/_l-common._l-video の詳細確認
            const videoRoute = loaderData['routes/_l-common._l-video']
            console.log('\n--- routes/_l-common._l-video ---')
            console.log('Type:', typeof videoRoute)
            console.log('Is null?:', videoRoute === null)
            console.log('Is undefined?:', videoRoute === undefined)
            console.log('Value:', JSON.stringify(videoRoute, null, 2))
            
            // 全ルートのデータを再帰的に探索
            console.log('\n=== 全ルート再帰探索 ===')
            
            const deepExplore = (obj: any, path: string = '', depth: number = 0, visited = new Set()): void => {
              if (depth > 15) {
                console.log(`${path}: [深さ制限]`)
                return
              }
              
              // 循環参照チェック
              if (obj && typeof obj === 'object') {
                if (visited.has(obj)) {
                  console.log(`${path}: [循環参照]`)
                  return
                }
                visited.add(obj)
              }
              
              if (obj === null) {
                console.log(`${path}: null`)
              } else if (obj === undefined) {
                console.log(`${path}: undefined`)
              } else if (Array.isArray(obj)) {
                console.log(`${path}: Array[${obj.length}]`)
                
                if (obj.length > 0) {
                  // 最初の要素を詳細に調査
                  const first = obj[0]
                  if (first && typeof first === 'object') {
                    const keys = Object.keys(first)
                    console.log(`${path}[0] keys: ${keys.join(', ')}`)
                    
                    // 動画データの可能性をチェック
                    if (first.id && first.title) {
                      console.log(`🎯 動画データ発見！ ${path}`)
                      console.log(`  タイトル: ${first.title}`)
                      console.log(`  ID: ${first.id}`)
                      console.log(`  再生数: ${first.count?.view || '不明'}`)
                      
                      // 全データを出力
                      console.log(`\n完全なデータ (${obj.length}件):`)
                      obj.slice(0, 10).forEach((item: any, idx: number) => {
                        console.log(`\n${idx + 1}. ${item.title}`)
                        console.log(`   ID: ${item.id}`)
                        console.log(`   再生数: ${item.count?.view || 0}`)
                        console.log(`   投稿者: ${item.owner?.name || '不明'}`)
                      })
                    }
                  }
                  
                  // 配列の各要素を探索（最初の5個まで）
                  obj.slice(0, 5).forEach((item, index) => {
                    deepExplore(item, `${path}[${index}]`, depth + 1, visited)
                  })
                }
              } else if (typeof obj === 'object') {
                const keys = Object.keys(obj)
                console.log(`${path}: Object{${keys.length} keys}`)
                
                if (keys.length > 0 && keys.length < 50) {
                  console.log(`  Keys: ${keys.join(', ')}`)
                }
                
                // 各プロパティを探索
                keys.forEach(key => {
                  deepExplore(obj[key], path ? `${path}.${key}` : key, depth + 1, visited)
                })
              } else {
                console.log(`${path}: ${typeof obj} = ${String(obj).substring(0, 100)}`)
              }
            }
            
            deepExplore(loaderData)
            
          } else {
            console.log('✗ loaderDataが見つかりません')
          }
          
          // state以外のプロパティも確認
          console.log('\n=== Remix Context その他のプロパティ ===')
          Object.keys(remixData).forEach(key => {
            if (key !== 'state') {
              console.log(`\n--- ${key} ---`)
              console.log(JSON.stringify(remixData[key], null, 2))
            }
          })
          
        } catch (parseError) {
          console.log(`✗ Remix JSON解析エラー`)
          console.error(parseError)
        }
        
      } else {
        console.log(`✗ Remixコンテキストが見つかりません`)
        
        // 代替案: script内のJSONデータを直接検索
        console.log('\n=== Script内のJSONデータ直接検索 ===')
        
        // window.__INITIAL_DATA__ や window.__DATA__ などのパターンを探す
        const dataPatterns = [
          /window\.__INITIAL_DATA__\s*=\s*({.+?});/,
          /window\.__DATA__\s*=\s*({.+?});/,
          /window\.__NUXT__\s*=\s*({.+?});/,
          /window\.__PRELOADED_STATE__\s*=\s*({.+?});/
        ]
        
        dataPatterns.forEach(pattern => {
          const match = html.match(pattern)
          if (match) {
            console.log(`\n✅ データパターン発見: ${pattern}`)
            try {
              const data = JSON.parse(match[1])
              console.log('データ構造:', Object.keys(data))
              console.log('詳細:', JSON.stringify(data, null, 2).substring(0, 1000))
            } catch (e) {
              console.log('JSON解析失敗')
            }
          }
        })
        
        // インライン JavaScript内の動画データを検索
        const videoIdPattern = /sm\d{5,}/g
        const videoIds = html.match(videoIdPattern)
        if (videoIds) {
          console.log(`\n動画ID発見: ${[...new Set(videoIds)].slice(0, 10).join(', ')}`)
        }
      }
      
    } else {
      console.log(`HTML取得失敗: ${proxyData.status}`)
    }
    
  } catch (error) {
    console.error('詳細解析エラー:', error)
  }
}

deepDiveLoaderData().catch(console.error)