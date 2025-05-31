#!/usr/bin/env tsx

// HTMLページの構造を詳細に分析

async function analyzeHtmlStructure() {
  console.log('=== HTMLページ構造分析 ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  // 例のソレジャンルページを詳細分析
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
      
      // 1. タイトル確認
      const titleMatch = html.match(/<title>([^<]+)<\/title>/)
      if (titleMatch) {
        console.log(`ページタイトル: ${titleMatch[1]}`)
      }
      
      // 2. 全てのmeta tagを検索
      console.log('\n=== Meta Tags 一覧 ===')
      const metaTags = html.match(/<meta[^>]*>/g)
      if (metaTags) {
        console.log(`Meta tag数: ${metaTags.length}`)
        metaTags.slice(0, 10).forEach((tag, index) => {
          console.log(`${index + 1}. ${tag}`)
        })
        
        // server-response系を特別に検索
        const serverResponseTags = metaTags.filter(tag => tag.includes('server-response'))
        if (serverResponseTags.length > 0) {
          console.log('\nserver-response Meta Tags:')
          serverResponseTags.forEach(tag => console.log(tag))
        } else {
          console.log('\nserver-response Meta Tag: 見つかりません')
        }
      }
      
      // 3. script tagを分析
      console.log('\n=== Script Tags 分析 ===')
      const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/g)
      if (scriptTags) {
        console.log(`Script tag数: ${scriptTags.length}`)
        
        scriptTags.forEach((script, index) => {
          if (script.includes('window.') || script.includes('__NUXT__') || script.includes('data')) {
            console.log(`\nScript ${index + 1} (長さ: ${script.length}文字):`)
            console.log(script.substring(0, 200) + '...')
            
            // JSONデータっぽい部分を検索
            if (script.includes('"items"') || script.includes('"ranking"') || script.includes('"d2um7mc4"')) {
              console.log('⭐ ランキングデータらしきものを発見')
            }
          }
        })
        
        // window.__NUXT__を特別に検索
        const nuxtScript = scriptTags.find(script => script.includes('__NUXT__'))
        if (nuxtScript) {
          console.log('\n🎯 NUXT データ発見')
          console.log(`長さ: ${nuxtScript.length}文字`)
          
          // NUXTデータからランキング情報を抽出試行
          try {
            const nuxtMatch = nuxtScript.match(/window\.__NUXT__\s*=\s*({.+?});?\s*<\/script>/)
            if (nuxtMatch) {
              const nuxtDataStr = nuxtMatch[1]
              console.log('NUXT JSON文字列の最初の200文字:')
              console.log(nuxtDataStr.substring(0, 200))
              
              // JSONとして解析を試行
              try {
                const nuxtData = JSON.parse(nuxtDataStr)
                console.log('✅ NUXT JSON解析成功')
                console.log('NUXT構造:', Object.keys(nuxtData))
                
                // ランキングデータを探す
                const findRankingData = (obj: any, path = ''): any => {
                  if (typeof obj !== 'object' || obj === null) return null
                  
                  if (Array.isArray(obj)) {
                    for (let i = 0; i < obj.length; i++) {
                      const result = findRankingData(obj[i], `${path}[${i}]`)
                      if (result) return result
                    }
                  } else {
                    for (const [key, value] of Object.entries(obj)) {
                      if (key === 'items' && Array.isArray(value) && value.length > 0 && value[0].title) {
                        console.log(`🎯 ランキングデータ発見: ${path}.${key}`)
                        return { path: `${path}.${key}`, data: value }
                      }
                      const result = findRankingData(value, path ? `${path}.${key}` : key)
                      if (result) return result
                    }
                  }
                  return null
                }
                
                const rankingResult = findRankingData(nuxtData)
                if (rankingResult) {
                  console.log(`\n🎉 ランキングデータ発見！`)
                  console.log(`パス: ${rankingResult.path}`)
                  console.log(`動画数: ${rankingResult.data.length}`)
                  
                  console.log('\n📺 上位5動画:')
                  rankingResult.data.slice(0, 5).forEach((item: any, index: number) => {
                    console.log(`${index + 1}位: ${item.title || item.name || 'タイトル不明'}`)
                    if (item.count?.view) {
                      console.log(`  再生数: ${item.count.view.toLocaleString()}回`)
                    }
                    if (item.id) {
                      console.log(`  ID: ${item.id}`)
                    }
                  })
                }
                
              } catch (nuxtParseError) {
                console.log('✗ NUXT JSON解析失敗:', nuxtParseError)
              }
            }
          } catch (nuxtError) {
            console.log('NUXT処理エラー:', nuxtError)
          }
        }
      }
      
      // 4. 動画タイトルっぽい文字列を直接検索
      console.log('\n=== 動画タイトル直接検索 ===')
      const videoTitlePatterns = [
        /【R-18】[^<>"]+/g,
        /【MMD】[^<>"]+/g,
        /ASMR[^<>"]+/g,
        /耳舐め[^<>"]+/g,
        /紳士向け[^<>"]+/g
      ]
      
      videoTitlePatterns.forEach((pattern, index) => {
        const matches = html.match(pattern)
        if (matches) {
          console.log(`\nパターン${index + 1} (${matches.length}個):`)
          matches.slice(0, 3).forEach(match => {
            console.log(`  - ${match}`)
          })
        }
      })
      
      // 5. リンクやID情報の検索
      console.log('\n=== 動画ID・リンク検索 ===')
      const videoIdMatches = html.match(/sm\d+/g)
      if (videoIdMatches) {
        const uniqueIds = [...new Set(videoIdMatches)]
        console.log(`動画ID発見: ${uniqueIds.length}個`)
        uniqueIds.slice(0, 10).forEach(id => {
          console.log(`  - ${id}`)
        })
      }
      
      const watchLinks = html.match(/\/watch\/[^"'\s]+/g)
      if (watchLinks) {
        const uniqueLinks = [...new Set(watchLinks)]
        console.log(`\n視聴リンク発見: ${uniqueLinks.length}個`)
        uniqueLinks.slice(0, 5).forEach(link => {
          console.log(`  - https://www.nicovideo.jp${link}`)
        })
      }
      
    } else {
      console.log(`HTML取得失敗: ${proxyData.status}`)
      console.log('エラー:', proxyData.body.substring(0, 200))
    }
    
  } catch (error) {
    console.error('分析エラー:', error)
  }
  
  console.log('\n=== 結論 ===')
  console.log('HTMLページ構造を詳細分析してランキングデータの格納場所を特定')
}

analyzeHtmlStructure().catch(console.error)