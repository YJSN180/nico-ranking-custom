#!/usr/bin/env tsx

// HTMLから直接ランキングデータを探す

async function findRankingInHtml() {
  console.log('=== HTMLから直接ランキングデータを探す ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  // 例のソレジャンルで解析
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
      
      // 1. 動画IDパターンでランキングデータの位置を特定
      console.log('\n=== 動画IDから位置を特定 ===')
      const videoIdPattern = /sm\d{7,9}/g
      const videoIdMatches = html.match(videoIdPattern)
      
      if (videoIdMatches) {
        const uniqueIds = [...new Set(videoIdMatches)]
        console.log(`動画ID発見: ${uniqueIds.length}個`)
        console.log(`最初の10個: ${uniqueIds.slice(0, 10).join(', ')}`)
        
        // 最初の動画IDの周辺を詳しく調査
        const firstId = uniqueIds[0]
        const idIndex = html.indexOf(firstId)
        if (idIndex !== -1) {
          const start = Math.max(0, idIndex - 1000)
          const end = Math.min(html.length, idIndex + 1000)
          const surrounding = html.substring(start, end)
          
          console.log(`\n${firstId}の周辺を解析:`)
          
          // JSONっぽいパターンを探す
          if (surrounding.includes('"title"') && surrounding.includes('"count"')) {
            console.log('✅ JSONデータらしき構造を発見')
            
            // JSONデータの開始位置を特定
            let jsonStart = -1
            let braceCount = 0
            
            // 動画IDから後ろ方向に{を探す
            for (let i = idIndex - start; i >= 0; i--) {
              if (surrounding[i] === '}') braceCount++
              if (surrounding[i] === '{') {
                braceCount--
                if (braceCount === -1) {
                  jsonStart = i
                  break
                }
              }
            }
            
            if (jsonStart !== -1) {
              console.log('JSON開始位置を特定')
              
              // JSONの終了位置を特定
              let jsonEnd = -1
              braceCount = 1
              for (let i = jsonStart + 1; i < surrounding.length; i++) {
                if (surrounding[i] === '{') braceCount++
                if (surrounding[i] === '}') {
                  braceCount--
                  if (braceCount === 0) {
                    jsonEnd = i + 1
                    break
                  }
                }
              }
              
              if (jsonEnd !== -1) {
                const jsonStr = surrounding.substring(jsonStart, jsonEnd)
                try {
                  const jsonData = JSON.parse(jsonStr)
                  console.log('✅ JSON解析成功！')
                  console.log('データ構造:', Object.keys(jsonData))
                  
                  if (jsonData.title && jsonData.id) {
                    console.log(`動画タイトル: ${jsonData.title}`)
                    console.log(`動画ID: ${jsonData.id}`)
                    console.log(`再生数: ${jsonData.count?.view || '不明'}`)
                  }
                } catch (e) {
                  console.log('JSON解析失敗（個別オブジェクト）')
                }
              }
            }
          }
        }
      }
      
      // 2. script内の大きなJSONデータを探す
      console.log('\n=== Script内の大きなJSONデータを探す ===')
      
      const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/g)
      if (scriptMatches) {
        console.log(`Scriptタグ数: ${scriptMatches.length}`)
        
        scriptMatches.forEach((script, index) => {
          // JSONっぽい大きなデータがあるか確認
          const jsonMatches = script.match(/\{[\s\S]{1000,}\}/g)
          if (jsonMatches) {
            console.log(`\nScript ${index + 1} に大きなJSONデータ発見`)
            
            jsonMatches.forEach((jsonStr, jsonIndex) => {
              // 動画IDが含まれているか確認
              if (jsonStr.includes('sm') && jsonStr.includes('title') && jsonStr.includes('count')) {
                console.log(`  JSON ${jsonIndex + 1}: 動画データの可能性あり`)
                
                try {
                  // __remixContext以外のJSONパターンも試す
                  const patterns = [
                    /window\.__remixContext\s*=\s*(\{[\s\S]+?\});/,
                    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});/,
                    /window\.__DATA__\s*=\s*(\{[\s\S]+?\});/,
                    /\{\s*"state"\s*:\s*\{[\s\S]+?\}\s*\}/,
                  ]
                  
                  for (const pattern of patterns) {
                    const match = script.match(pattern)
                    if (match) {
                      console.log(`    パターンマッチ: ${pattern}`)
                      const data = JSON.parse(match[1] || match[0])
                      
                      // データを深く探索してランキングを探す
                      const findRankingDeep = (obj: any, path = ''): any => {
                        if (!obj || typeof obj !== 'object') return null
                        
                        if (Array.isArray(obj) && obj.length > 10) {
                          const first = obj[0]
                          if (first && first.id && first.title && first.count) {
                            return { path, data: obj }
                          }
                        }
                        
                        for (const [key, value] of Object.entries(obj)) {
                          if (key === 'items' || key === 'videos' || key === 'ranking') {
                            if (Array.isArray(value) && value.length > 0) {
                              const first = value[0]
                              if (first && first.id && first.title) {
                                return { path: `${path}.${key}`, data: value }
                              }
                            }
                          }
                          
                          const result = findRankingDeep(value, path ? `${path}.${key}` : key)
                          if (result) return result
                        }
                        
                        return null
                      }
                      
                      const rankingResult = findRankingDeep(data)
                      if (rankingResult) {
                        console.log(`      🎯 ランキングデータ発見！`)
                        console.log(`      パス: ${rankingResult.path}`)
                        console.log(`      動画数: ${rankingResult.data.length}`)
                        
                        // データを出力
                        console.log('\n📊 例のソレジャンル ランキングデータ:')
                        rankingResult.data.slice(0, 10).forEach((item: any, idx: number) => {
                          console.log(`\n${idx + 1}位: ${item.title}`)
                          console.log(`  ID: ${item.id}`)
                          console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                          console.log(`  投稿者: ${item.owner?.name || '不明'}`)
                        })
                        
                        return
                      }
                    }
                  }
                  
                } catch (parseError) {
                  // エラーは無視して続行
                }
              }
            })
          }
        })
      }
      
      // 3. SSRデータを探す別の方法
      console.log('\n=== SSRデータの別パターンを探す ===')
      
      // __remixManifest や __remixRouteModules なども確認
      const ssrPatterns = [
        '__remixManifest',
        '__remixRouteModules',
        '__remixContext',
        '__INITIAL_DATA__',
        '__NEXT_DATA__',
        '__NUXT__'
      ]
      
      ssrPatterns.forEach(pattern => {
        if (html.includes(`window.${pattern}`)) {
          console.log(`✅ ${pattern} を発見`)
          
          const regex = new RegExp(`window\\.${pattern}\\s*=\\s*(.+?);`, 's')
          const match = html.match(regex)
          if (match) {
            console.log(`  データサイズ: ${match[1].length}文字`)
            
            // 動画データが含まれているか簡易チェック
            if (match[1].includes('"title"') && match[1].includes('"count"')) {
              console.log(`  🎯 動画データを含む可能性あり`)
            }
          }
        }
      })
      
      // 4. HTML内の動画リストを直接探す
      console.log('\n=== HTML要素から動画リストを探す ===')
      
      // aタグのhrefからwatch URLを探す
      const watchLinks = html.match(/href="\/watch\/sm\d+"/g)
      if (watchLinks) {
        const uniqueWatchIds = [...new Set(watchLinks.map(link => {
          const match = link.match(/sm\d+/)
          return match ? match[0] : null
        }).filter(Boolean))]
        
        console.log(`Watch リンク発見: ${uniqueWatchIds.length}個`)
        console.log(`動画ID: ${uniqueWatchIds.slice(0, 10).join(', ')}`)
      }
      
    } else {
      console.log(`HTML取得失敗: ${proxyData.status}`)
    }
    
  } catch (error) {
    console.error('解析エラー:', error)
  }
}

findRankingInHtml().catch(console.error)