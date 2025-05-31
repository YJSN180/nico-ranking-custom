#!/usr/bin/env tsx

// Remixの詳細な構造を調査

async function debugRemixStructure() {
  console.log('=== Remix構造の詳細調査 ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  // 例のソレジャンルで詳細調査
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
      
      // Remixコンテキストの詳細解析
      const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
      if (remixMatch) {
        console.log(`✅ Remixコンテキスト発見`)
        
        try {
          const remixDataStr = remixMatch[1]
          console.log(`JSON文字列長: ${remixDataStr.length}文字`)
          
          const remixData = JSON.parse(remixDataStr)
          console.log('Remix構造:', Object.keys(remixData))
          
          // 各プロパティを詳細調査
          Object.entries(remixData).forEach(([key, value]) => {
            console.log(`\n=== ${key} ===`)
            console.log(`タイプ: ${typeof value}`)
            
            if (value && typeof value === 'object') {
              if (Array.isArray(value)) {
                console.log(`配列長: ${value.length}`)
                if (value.length > 0) {
                  console.log(`最初の要素タイプ: ${typeof value[0]}`)
                }
              } else {
                console.log(`オブジェクトキー: ${Object.keys(value).join(', ')}`)
                
                // 深く掘り下げ
                if (key === 'state') {
                  console.log('\n--- state の詳細 ---')
                  Object.entries(value).forEach(([stateKey, stateValue]) => {
                    console.log(`  ${stateKey}: ${typeof stateValue}`)
                    
                    if (stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
                      const subKeys = Object.keys(stateValue)
                      console.log(`    サブキー: ${subKeys.join(', ')}`)
                      
                      // loaderDataらしきものを探す
                      if (stateKey === 'loaderData' || subKeys.includes('loaderData')) {
                        console.log(`🎯 ${stateKey} にloaderDataらしきものを発見`)
                      }
                      
                      // 配列データを探す
                      subKeys.forEach(subKey => {
                        const subValue = (stateValue as any)[subKey]
                        if (Array.isArray(subValue) && subValue.length > 0) {
                          console.log(`    🎯 配列データ発見: ${subKey} (${subValue.length}要素)`)
                          
                          const firstItem = subValue[0]
                          if (firstItem && typeof firstItem === 'object' && firstItem.title) {
                            console.log(`      ✅ 動画データらしき構造: ${firstItem.title}`)
                            console.log(`      ID: ${firstItem.id || '不明'}`)
                            console.log(`      再生数: ${firstItem.count?.view || '不明'}`)
                          }
                        }
                      })
                    }
                  })
                }
              }
            } else {
              console.log(`値: ${String(value).substring(0, 100)}`)
            }
          })
          
          // 深い探索でランキングデータを検索
          console.log('\n=== 深い探索でランキングデータ検索 ===')
          
          const deepSearch = (obj: any, path = '', depth = 0): any[] => {
            const results: any[] = []
            
            if (depth > 10) return results // 無限ループ防止
            
            if (!obj || typeof obj !== 'object') return results
            
            if (Array.isArray(obj)) {
              if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && obj[0].title && obj[0].id) {
                results.push({ path, data: obj, type: 'ranking' })
              }
              
              obj.forEach((item, index) => {
                if (index < 5) { // 最初の5要素のみチェック
                  results.push(...deepSearch(item, `${path}[${index}]`, depth + 1))
                }
              })
            } else {
              Object.entries(obj).forEach(([key, value]) => {
                const newPath = path ? `${path}.${key}` : key
                
                if (key === 'items' && Array.isArray(value) && value.length > 0) {
                  const firstItem = value[0]
                  if (firstItem && firstItem.title && firstItem.id) {
                    results.push({ path: newPath, data: value, type: 'items' })
                  }
                }
                
                results.push(...deepSearch(value, newPath, depth + 1))
              })
            }
            
            return results
          }
          
          const searchResults = deepSearch(remixData)
          
          if (searchResults.length > 0) {
            console.log(`🎉 ランキングデータ発見: ${searchResults.length}個`)
            
            searchResults.forEach((result, index) => {
              console.log(`\n${index + 1}. パス: ${result.path}`)
              console.log(`   タイプ: ${result.type}`)
              console.log(`   動画数: ${result.data.length}`)
              
              if (result.data.length > 0) {
                const firstVideo = result.data[0]
                console.log(`   サンプル: ${firstVideo.title}`)
                console.log(`   ID: ${firstVideo.id}`)
                console.log(`   再生数: ${firstVideo.count?.view?.toLocaleString() || '不明'}回`)
                
                // この結果を使ってタグ分析
                if (index === 0) { // 最初の結果で詳細分析
                  console.log(`\n📊 詳細分析 (${result.path}):`)
                  
                  const tagCounts: any = {}
                  result.data.forEach((item: any) => {
                    if (item.tags && Array.isArray(item.tags)) {
                      item.tags.forEach((tag: any) => {
                        const tagName = tag.name || tag
                        if (tagName && typeof tagName === 'string' && tagName.length > 0 && tagName.length < 25) {
                          tagCounts[tagName] = (tagCounts[tagName] || 0) + 1
                        }
                      })
                    }
                  })
                  
                  const popularTags = Object.entries(tagCounts)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 10)
                    .map(([tag, count]) => ({ tag, count }))
                  
                  console.log(`\n人気タグ TOP 10:`)
                  popularTags.forEach((item: any, tagIndex) => {
                    console.log(`  ${tagIndex + 1}. ${item.tag} (${item.count}回出現)`)
                  })
                  
                  console.log(`\n上位10動画:`)
                  result.data.slice(0, 10).forEach((item: any, videoIndex) => {
                    console.log(`\n${videoIndex + 1}位: ${item.title}`)
                    console.log(`  ID: ${item.id}`)
                    console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                    console.log(`  投稿者: ${item.owner?.name || '不明'}`)
                    console.log(`  URL: https://www.nicovideo.jp/watch/${item.id}`)
                    
                    if (item.tags && item.tags.length > 0) {
                      const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 5)
                      console.log(`  タグ: ${tagNames.join(', ')}`)
                    }
                  })
                }
              }
            })
          } else {
            console.log('❌ ランキングデータが見つかりませんでした')
          }
          
        } catch (parseError) {
          console.log(`✗ Remix JSON解析エラー`)
          console.error(parseError)
          
          // JSONの一部を表示してデバッグ
          console.log('\nJSON文字列の最初の500文字:')
          console.log(remixMatch[1].substring(0, 500))
        }
        
      } else {
        console.log(`✗ Remixコンテキストが見つかりません`)
        
        // 他のJavaScriptデータを探す
        console.log('\n=== 他のスクリプトデータ検索 ===')
        
        const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/g)
        if (scriptTags) {
          scriptTags.forEach((script, index) => {
            if (script.includes('"title"') && script.includes('"id"') && script.includes('sm')) {
              console.log(`\nScript ${index + 1} に動画データらしきものを発見:`)
              console.log(script.substring(0, 300) + '...')
            }
          })
        }
      }
      
    } else {
      console.log(`HTML取得失敗: ${proxyData.status}`)
    }
    
  } catch (error) {
    console.error('調査エラー:', error)
  }
}

debugRemixStructure().catch(console.error)