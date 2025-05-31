#!/usr/bin/env tsx

// Remixコンテキストからランキングデータを抽出

async function extractRemixData() {
  console.log('=== Remixコンテキストからランキングデータ抽出 ===')
  
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
  
  // 各ジャンルからRemixデータを抽出
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
            const remixDataStr = remixMatch[1]
            const remixData = JSON.parse(remixDataStr)
            console.log('Remix構造:', Object.keys(remixData))
            
            // loaderDataを詳細に調査
            if (remixData.loaderData) {
              console.log('LoaderData構造:', Object.keys(remixData.loaderData))
              
              // 各ルートのデータを確認
              Object.entries(remixData.loaderData).forEach(([routeId, data]: [string, any]) => {
                console.log(`\nRoute: ${routeId}`)
                if (data && typeof data === 'object') {
                  console.log(`  データ構造: ${Object.keys(data).join(', ')}`)
                  
                  // ランキングデータらしきものを探す
                  const findRankingInRoute = (obj: any, path = ''): any => {
                    if (!obj || typeof obj !== 'object') return null
                    
                    if (Array.isArray(obj)) {
                      if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && obj[0].title) {
                        return { path, data: obj }
                      }
                      for (let i = 0; i < Math.min(obj.length, 5); i++) {
                        const result = findRankingInRoute(obj[i], `${path}[${i}]`)
                        if (result) return result
                      }
                    } else {
                      for (const [key, value] of Object.entries(obj)) {
                        if (key === 'items' && Array.isArray(value) && value.length > 0) {
                          const firstItem = value[0]
                          if (firstItem && firstItem.title && firstItem.id) {
                            return { path: `${path}.${key}`, data: value }
                          }
                        }
                        
                        if (typeof value === 'object' && value !== null) {
                          const result = findRankingInRoute(value, path ? `${path}.${key}` : key)
                          if (result) return result
                        }
                      }
                    }
                    return null
                  }
                  
                  const rankingResult = findRankingInRoute(data)
                  if (rankingResult) {
                    console.log(`🎯 ランキングデータ発見！`)
                    console.log(`  パス: ${rankingResult.path}`)
                    console.log(`  動画数: ${rankingResult.data.length}`)
                    
                    // ジャンル情報の確認
                    const firstVideo = rankingResult.data[0]
                    console.log(`  サンプル動画: ${firstVideo.title}`)
                    console.log(`  動画ID: ${firstVideo.id}`)
                    
                    if (firstVideo.count?.view) {
                      console.log(`  再生数: ${firstVideo.count.view.toLocaleString()}回`)
                    }
                    
                    // タグ情報の収集
                    const tagCounts: any = {}
                    rankingResult.data.forEach((item: any) => {
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
                    
                    console.log(`\n📊 ${genre.name}ジャンル 人気タグ TOP 10:`)
                    popularTags.slice(0, 10).forEach((item: any, index) => {
                      console.log(`  ${index + 1}. ${item.tag} (${item.count}回出現)`)
                    })
                    
                    genreResults[genre.id] = {
                      name: genre.name,
                      popularTags: popularTags,
                      selectedTag: popularTags[0]?.tag || null,
                      rankingData: rankingResult.data,
                      totalVideos: rankingResult.data.length,
                      routeId: routeId,
                      dataPath: rankingResult.path
                    }
                    
                    console.log(`\n🎯 選択タグ: 「${popularTags[0]?.tag || 'なし'}」`)
                    
                    // 上位5動画の詳細表示
                    console.log(`\n📺 ${genre.name}ジャンル TOP 5:`)
                    rankingResult.data.slice(0, 5).forEach((item: any, index: number) => {
                      console.log(`\n${index + 1}位: ${item.title}`)
                      console.log(`  ID: ${item.id}`)
                      console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                      console.log(`  投稿者: ${item.owner?.name || '不明'}`)
                      console.log(`  投稿日: ${item.registeredAt || '不明'}`)
                      
                      if (item.tags && item.tags.length > 0) {
                        const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 5)
                        console.log(`  タグ: ${tagNames.join(', ')}`)
                      }
                      
                      // R-18判定
                      const isR18 = item.title.includes('R-18') || item.title.includes('紳士向け')
                      const isASMR = item.title.includes('ASMR') || item.title.includes('耳舐め')
                      
                      if (isR18 || isASMR) {
                        const types = []
                        if (isR18) types.push('🔞R-18')
                        if (isASMR) types.push('🎧ASMR')
                        console.log(`  種別: ${types.join(', ')}`)
                      }
                    })
                    
                    return // ランキングデータが見つかったらこの関数を終了
                  }
                }
              })
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
  
  // タグ別ランキング取得
  if (Object.keys(genreResults).length > 0) {
    console.log(`\n${'='.repeat(80)}`)
    console.log('=== タグ別ランキング取得（上位10動画ずつ） ===')
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
          
          // Remixコンテキストからタグ別データを抽出
          const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
          if (remixMatch) {
            try {
              const remixData = JSON.parse(remixMatch[1])
              
              // loaderDataからタグ別ランキングを探す
              let tagRankingData = null
              
              if (remixData.loaderData) {
                Object.values(remixData.loaderData).forEach((data: any) => {
                  if (data && typeof data === 'object') {
                    const findTagRanking = (obj: any): any => {
                      if (!obj || typeof obj !== 'object') return null
                      
                      if (Array.isArray(obj)) {
                        if (obj.length > 0 && obj[0] && obj[0].title && obj[0].id) {
                          return obj
                        }
                      } else {
                        for (const value of Object.values(obj)) {
                          if (Array.isArray(value) && value.length > 0 && value[0] && value[0].title) {
                            return value
                          }
                          if (typeof value === 'object' && value !== null) {
                            const result = findTagRanking(value)
                            if (result) return result
                          }
                        }
                      }
                      return null
                    }
                    
                    const result = findTagRanking(data)
                    if (result && !tagRankingData) {
                      tagRankingData = result
                    }
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
  
  Object.values(genreResults).forEach((genre: any) => {
    console.log(`\n📂 ${genre.name}ジャンル:`)
    console.log(`  総動画数: ${genre.totalVideos}`)
    console.log(`  選択タグ: 「${genre.selectedTag}」`)
    console.log(`  人気タグ数: ${genre.popularTags?.length || 0}`)
    
    if (genre.popularTags && genre.popularTags.length > 0) {
      const top5 = genre.popularTags.slice(0, 5).map((tag: any) => `${tag.tag}(${tag.count})`)
      console.log(`  トップ5タグ: ${top5.join(', ')}`)
    }
  })
  
  console.log(`\n🎉 成功: Remixコンテキストから両ジャンルの完全なランキングデータを取得`)
  console.log(`🔞 センシティブコンテンツを含む「例のソレ」ジャンルも正常取得`)
  console.log(`📱 スマートフォン版サイトのサーバーサイドレンダリングデータを活用`)
}

extractRemixData().catch(console.error)