#!/usr/bin/env tsx

// loaderDataから直接ランキングデータを抽出

async function extractLoaderData() {
  console.log('=== loaderDataからランキングデータ抽出 ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  const genres = [
    { 
      name: 'その他', 
      id: 'ramuboyn',
      url: 'https://sp.nicovideo.jp/ranking/genre/ramuboyn?redirected=1'
    },
    { 
      name: '例のソレ', 
      id: 'd2um7mc4',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?redirected=1'
    }
  ]
  
  const genreResults: any = {}
  
  // 各ジャンルのloaderDataを抽出
  for (const genre of genres) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`=== ${genre.name}ジャンル (${genre.id}) ===`)
    console.log(`${'='.repeat(50)}`)
    console.log(`URL: ${genre.url}`)
    
    try {
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: genre.url,
          headers: fullHeaders
        }),
      })

      const proxyData = await response.json()
      
      if (proxyData.status === 200) {
        const html = proxyData.body
        console.log(`HTMLサイズ: ${html.length.toLocaleString()}文字`)
        
        // Remixコンテキストを抽出
        const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
        if (remixMatch) {
          console.log(`✅ Remixコンテキスト発見`)
          
          try {
            const remixData = JSON.parse(remixMatch[1])
            const loaderData = remixData.state?.loaderData
            
            if (loaderData) {
              console.log('loaderData構造:', Object.keys(loaderData))
              
              // 各ルートのloaderDataを詳細に調査
              Object.entries(loaderData).forEach(([routeId, data]) => {
                console.log(`\n--- Route: ${routeId} ---`)
                
                if (data && typeof data === 'object') {
                  console.log(`データ構造: ${Object.keys(data).join(', ')}`)
                  
                  // ランキング関連のキーを探す
                  const rankingKeys = Object.keys(data).filter(key => 
                    key.toLowerCase().includes('ranking') || 
                    key.toLowerCase().includes('items') ||
                    key.toLowerCase().includes('videos') ||
                    key.toLowerCase().includes('data')
                  )
                  
                  if (rankingKeys.length > 0) {
                    console.log(`🎯 ランキング関連キー: ${rankingKeys.join(', ')}`)
                    
                    rankingKeys.forEach(key => {
                      const value = (data as any)[key]
                      console.log(`\n  ${key}: ${typeof value}`)
                      
                      if (Array.isArray(value)) {
                        console.log(`    配列長: ${value.length}`)
                        if (value.length > 0 && value[0] && typeof value[0] === 'object') {
                          const firstItem = value[0]
                          console.log(`    最初の要素キー: ${Object.keys(firstItem).join(', ')}`)
                          
                          if (firstItem.title && firstItem.id) {
                            console.log(`    🎉 動画データ発見！`)
                            console.log(`      タイトル: ${firstItem.title}`)
                            console.log(`      ID: ${firstItem.id}`)
                            console.log(`      再生数: ${firstItem.count?.view?.toLocaleString() || '不明'}`)
                            
                            // このデータを保存
                            const tagCounts: any = {}
                            value.forEach((item: any) => {
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
                              .slice(0, 15)
                              .map(([tag, count]) => ({ tag, count }))
                            
                            genreResults[genre.id] = {
                              name: genre.name,
                              popularTags: popularTags,
                              selectedTag: popularTags[0]?.tag || null,
                              rankingData: value,
                              totalVideos: value.length,
                              routeId: routeId,
                              dataKey: key
                            }
                            
                            console.log(`\n📊 ${genre.name}ジャンル 人気タグ TOP 10:`)
                            popularTags.slice(0, 10).forEach((item: any, index) => {
                              console.log(`      ${index + 1}. ${item.tag} (${item.count}回出現)`)
                            })
                            
                            console.log(`\n📺 ${genre.name}ジャンル TOP 5動画:`)
                            value.slice(0, 5).forEach((item: any, index: number) => {
                              console.log(`\n      ${index + 1}位: ${item.title}`)
                              console.log(`        ID: ${item.id}`)
                              console.log(`        再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                              console.log(`        投稿者: ${item.owner?.name || '不明'}`)
                              console.log(`        URL: https://www.nicovideo.jp/watch/${item.id}`)
                              
                              if (item.tags && item.tags.length > 0) {
                                const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 5)
                                console.log(`        タグ: ${tagNames.join(', ')}`)
                              }
                            })
                          }
                        }
                      } else if (value && typeof value === 'object') {
                        console.log(`    オブジェクトキー: ${Object.keys(value).join(', ')}`)
                        
                        // オブジェクト内の配列を探す
                        Object.entries(value).forEach(([subKey, subValue]) => {
                          if (Array.isArray(subValue) && subValue.length > 0) {
                            console.log(`      サブ配列: ${subKey} (${subValue.length}要素)`)
                            
                            const firstSubItem = subValue[0]
                            if (firstSubItem && typeof firstSubItem === 'object' && firstSubItem.title) {
                              console.log(`      🎉 サブ動画データ発見: ${firstSubItem.title}`)
                            }
                          }
                        })
                      }
                    })
                  } else {
                    console.log('ランキング関連のキーなし')
                    
                    // 全キーを調査してArrayを探す
                    Object.entries(data).forEach(([key, value]) => {
                      if (Array.isArray(value) && value.length > 0) {
                        console.log(`  配列発見: ${key} (${value.length}要素)`)
                        
                        const firstItem = value[0]
                        if (firstItem && typeof firstItem === 'object') {
                          const itemKeys = Object.keys(firstItem)
                          console.log(`    要素構造: ${itemKeys.join(', ')}`)
                          
                          if (firstItem.title || firstItem.id || firstItem.name) {
                            console.log(`    🔍 可能性あり: ${firstItem.title || firstItem.name || firstItem.id}`)
                          }
                        }
                      }
                    })
                  }
                } else {
                  console.log(`データがnullまたは非オブジェクト: ${typeof data}`)
                }
              })
            } else {
              console.log('✗ loaderDataが見つかりません')
            }
            
          } catch (parseError) {
            console.log(`✗ ${genre.name}ジャンル: Remix JSON解析エラー`)
            console.error(parseError)
          }
          
        } else {
          console.log(`✗ ${genre.name}ジャンル: Remixコンテキストが見つかりません`)
        }
        
      } else {
        console.log(`✗ ${genre.name}ジャンル: HTML取得失敗 ${proxyData.status}`)
      }
      
    } catch (error) {
      console.error(`${genre.name}ジャンル エラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // タグ別ランキング取得（見つかったデータがある場合）
  if (Object.keys(genreResults).length > 0) {
    console.log(`\n${'='.repeat(80)}`)
    console.log('=== タグ別ランキング取得 ===')
    console.log(`${'='.repeat(80)}`)
    
    for (const genreId of Object.keys(genreResults)) {
      const genreInfo = genreResults[genreId]
      const selectedTag = genreInfo.selectedTag
      
      if (!selectedTag) {
        console.log(`\n❌ ${genreInfo.name}ジャンル: 選択可能なタグなし`)
        continue
      }
      
      console.log(`\n🏆 ${genreInfo.name}ジャンル「${selectedTag}」タグランキング TOP 10`)
      console.log(`${'─'.repeat(60)}`)
      
      try {
        const tagPageUrl = `https://sp.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(selectedTag)}&redirected=1`
        console.log(`URL: ${tagPageUrl}`)
        
        const response = await fetch('http://localhost:8888/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            url: tagPageUrl,
            headers: fullHeaders
          }),
        })

        const proxyData = await response.json()
        
        if (proxyData.status === 200) {
          const html = proxyData.body
          
          const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
          if (remixMatch) {
            try {
              const remixData = JSON.parse(remixMatch[1])
              const loaderData = remixData.state?.loaderData
              
              if (loaderData) {
                let tagRankingData = null
                
                // 同じルートとキーで探す
                const routeData = loaderData[genreInfo.routeId]
                if (routeData && routeData[genreInfo.dataKey]) {
                  tagRankingData = routeData[genreInfo.dataKey]
                }
                
                // 見つからない場合は全ルートを探す
                if (!tagRankingData) {
                  Object.values(loaderData).forEach((data: any) => {
                    if (data && typeof data === 'object') {
                      Object.values(data).forEach((value: any) => {
                        if (Array.isArray(value) && value.length > 0 && value[0] && value[0].title) {
                          tagRankingData = value
                        }
                      })
                    }
                  })
                }
                
                if (tagRankingData && tagRankingData.length > 0) {
                  console.log(`✅ 「${selectedTag}」タグランキング取得成功`)
                  console.log(`  動画数: ${tagRankingData.length}`)
                  
                  tagRankingData.slice(0, 10).forEach((item: any, index: number) => {
                    console.log(`\n${index + 1}位: ${item.title}`)
                    console.log(`  動画ID: ${item.id}`)
                    console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                    console.log(`  コメント: ${item.count?.comment?.toLocaleString() || '不明'}件`)
                    console.log(`  マイリスト: ${item.count?.mylist?.toLocaleString() || '不明'}件`)
                    console.log(`  投稿者: ${item.owner?.name || '不明'} (ID: ${item.owner?.id || '不明'})`)
                    console.log(`  投稿日: ${item.registeredAt || '不明'}`)
                    console.log(`  時間: ${item.duration ? Math.floor(item.duration / 60) + '分' + (item.duration % 60) + '秒' : '不明'}`)
                    console.log(`  URL: https://www.nicovideo.jp/watch/${item.id}`)
                    
                    if (item.tags && item.tags.length > 0) {
                      const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 8)
                      console.log(`  タグ: ${tagNames.join(', ')}`)
                    }
                    
                    if (item.shortDescription) {
                      const desc = item.shortDescription.substring(0, 100)
                      console.log(`  説明: ${desc}${item.shortDescription.length > 100 ? '...' : ''}`)
                    }
                    
                    // R-18やASMR判定
                    const title = item.title.toLowerCase()
                    const contentTypes = []
                    if (title.includes('r-18') || title.includes('紳士向け')) contentTypes.push('🔞R-18')
                    if (title.includes('asmr') || title.includes('耳舐め')) contentTypes.push('🎧ASMR')
                    if (title.includes('mmd')) contentTypes.push('💃MMD')
                    
                    if (contentTypes.length > 0) {
                      console.log(`  種別: ${contentTypes.join(', ')}`)
                    }
                  })
                  
                  // 統計情報
                  const views = tagRankingData.map((item: any) => item.count?.view || 0)
                  const totalViews = views.reduce((sum: number, view: number) => sum + view, 0)
                  const avgViews = Math.round(totalViews / views.length)
                  const maxViews = Math.max(...views)
                  
                  console.log(`\n📊 ${genreInfo.name}ジャンル「${selectedTag}」統計:`)
                  console.log(`  総再生数: ${totalViews.toLocaleString()}回`)
                  console.log(`  平均再生数: ${avgViews.toLocaleString()}回`)
                  console.log(`  最高再生数: ${maxViews.toLocaleString()}回`)
                  
                } else {
                  console.log(`✗ 「${selectedTag}」タグ: ランキングデータなし`)
                }
              }
              
            } catch (parseError) {
              console.log(`✗ 「${selectedTag}」タグ: Remix解析エラー`)
            }
          }
          
        } else {
          console.log(`✗ 「${selectedTag}」タグページ取得失敗: ${proxyData.status}`)
        }
        
      } catch (error) {
        console.error(`「${selectedTag}」タグエラー:`, error)
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  // 最終サマリー
  console.log(`\n${'='.repeat(80)}`)
  console.log('=== 最終結果サマリー ===')
  console.log(`${'='.repeat(80)}`)
  
  const totalGenres = Object.keys(genreResults).length
  console.log(`取得成功ジャンル数: ${totalGenres}`)
  
  Object.values(genreResults).forEach((genre: any) => {
    console.log(`\n📂 ${genre.name}ジャンル:`)
    console.log(`  総動画数: ${genre.totalVideos}`)
    console.log(`  選択タグ: 「${genre.selectedTag}」`)
    console.log(`  人気タグ数: ${genre.popularTags?.length || 0}`)
    console.log(`  データ場所: ${genre.routeId}.${genre.dataKey}`)
    
    if (genre.popularTags && genre.popularTags.length > 0) {
      const top5 = genre.popularTags.slice(0, 5).map((tag: any) => `${tag.tag}(${tag.count})`)
      console.log(`  トップ5タグ: ${top5.join(', ')}`)
    }
  })
  
  if (totalGenres > 0) {
    console.log(`\n🎉 成功: loaderDataから${totalGenres}ジャンルの完全なランキングデータを抽出`)
    console.log(`🔞 センシティブコンテンツを含むデータも正常取得`)
    console.log(`📱 Remixのサーバーサイドレンダリングデータを完全活用`)
  } else {
    console.log(`\n❌ 失敗: ランキングデータを取得できませんでした`)
  }
}

extractLoaderData().catch(console.error)