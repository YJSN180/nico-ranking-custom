#!/usr/bin/env tsx

// HTMLページから直接ランキングデータを抽出

async function extractFromHtmlPages() {
  console.log('=== HTMLページからランキングデータ抽出 ===')
  
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
  
  // 各ジャンルのHTMLページからデータ抽出
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
      console.log(`HTTP Status: ${proxyData.status}`)
      
      if (proxyData.status === 200) {
        const html = proxyData.body
        console.log(`HTMLサイズ: ${html.length.toLocaleString()}文字`)
        
        // meta tagからランキングデータを抽出
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        if (metaMatch) {
          console.log(`✅ meta tagを発見`)
          
          try {
            const encodedData = metaMatch[1]
            const decodedData = encodedData
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
            
            const jsonData = JSON.parse(decodedData)
            console.log('JSON構造:', Object.keys(jsonData))
            
            if (jsonData.data?.response) {
              console.log('response構造:', Object.keys(jsonData.data.response))
              
              // ランキングデータを探す
              const rankingData = jsonData.data.response.$getTeibanRanking?.data
              
              if (rankingData && rankingData.items) {
                console.log(`✅ ${genre.name}ジャンル ランキングデータ取得成功`)
                console.log(`  ジャンル: ${rankingData.label}`)
                console.log(`  フィーチャーキー: ${rankingData.featuredKey}`)
                console.log(`  動画数: ${rankingData.items.length}`)
                console.log(`  タグ設定: ${rankingData.tag || 'なし'}`)
                
                // 動画サンプル表示
                console.log(`\n📺 ${genre.name}ジャンル サンプル動画 TOP 5:`)
                rankingData.items.slice(0, 5).forEach((item: any, index: number) => {
                  console.log(`  ${index + 1}位: ${item.title}`)
                  console.log(`    再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                  console.log(`    投稿者: ${item.owner?.name || '不明'}`)
                  console.log(`    ID: ${item.id}`)
                })
                
                // タグ分析
                const tagCounts: any = {}
                rankingData.items.forEach((item: any) => {
                  if (item.tags && Array.isArray(item.tags)) {
                    item.tags.forEach((tag: any) => {
                      const tagName = tag.name || tag
                      if (tagName && typeof tagName === 'string' && tagName.length > 0 && tagName.length < 25) {
                        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1
                      }
                    })
                  }
                })
                
                // 人気タグトップ10
                const popularTags = Object.entries(tagCounts)
                  .sort(([,a], [,b]) => (b as number) - (a as number))
                  .slice(0, 10)
                  .map(([tag, count]) => ({ tag, count }))
                
                console.log(`\n📊 ${genre.name}ジャンル 人気タグ TOP 10:`)
                popularTags.forEach((item: any, index) => {
                  console.log(`  ${index + 1}. ${item.tag} (${item.count}回出現)`)
                })
                
                genreResults[genre.id] = {
                  name: genre.name,
                  popularTags: popularTags,
                  selectedTag: popularTags[0]?.tag || null,
                  rankingData: rankingData,
                  totalVideos: rankingData.items.length
                }
                
                console.log(`\n🎯 選択タグ: 「${popularTags[0]?.tag || 'なし'}」`)
                
              } else {
                console.log(`✗ ${genre.name}ジャンル: ランキングデータなし`)
                console.log('response内のキー:', Object.keys(jsonData.data.response))
              }
              
              // 人気タグ専用データも探す
              const featuredKeysData = jsonData.data.response.$getTeibanRankingFeaturedKeys?.data
              if (featuredKeysData?.items) {
                console.log(`\n🏷️ ${genre.name}ジャンル 人気タグリスト (${featuredKeysData.items.length}個):`)
                featuredKeysData.items.slice(0, 10).forEach((item: any, index: number) => {
                  console.log(`  ${index + 1}. ${item.label} (featuredKey: ${item.featuredKey})`)
                })
              }
            }
            
          } catch (parseError) {
            console.log(`✗ ${genre.name}ジャンル: JSON解析エラー`)
            console.error(parseError)
          }
          
        } else {
          console.log(`✗ ${genre.name}ジャンル: meta tagが見つかりません`)
        }
        
      } else {
        console.log(`✗ ${genre.name}ジャンル: HTML取得失敗 ${proxyData.status}`)
        console.log('エラー:', proxyData.body.substring(0, 200))
      }
      
    } catch (error) {
      console.error(`${genre.name}ジャンル エラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // タグ別ランキング取得
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
    
    console.log(`\n🏆 ${genreInfo.name}ジャンル「${selectedTag}」タグランキング`)
    console.log(`${'─'.repeat(60)}`)
    
    try {
      // タグ別ページのURL
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
        
        // meta tagからタグ別ランキングデータを抽出
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        if (metaMatch) {
          try {
            const encodedData = metaMatch[1]
            const decodedData = encodedData
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
            
            const jsonData = JSON.parse(decodedData)
            const tagRankingData = jsonData.data?.response?.$getTeibanRanking?.data
            
            if (tagRankingData && tagRankingData.items) {
              console.log(`✅ 「${selectedTag}」タグランキング取得成功`)
              console.log(`  動画数: ${tagRankingData.items.length}`)
              console.log(`  タグ確認: ${tagRankingData.tag || 'なし'}`)
              
              console.log(`\n🥇 ${genreInfo.name}ジャンル「${selectedTag}」TOP 10:`)
              
              tagRankingData.items.slice(0, 10).forEach((item: any, index: number) => {
                console.log(`\n${index + 1}位: ${item.title}`)
                console.log(`  動画ID: ${item.id}`)
                console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                console.log(`  コメント: ${item.count?.comment?.toLocaleString() || '不明'}件`)
                console.log(`  投稿者: ${item.owner?.name || '不明'}`)
                console.log(`  投稿日: ${item.registeredAt || '不明'}`)
                console.log(`  URL: https://www.nicovideo.jp/watch/${item.id}`)
                
                if (item.tags && item.tags.length > 0) {
                  const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 5)
                  console.log(`  タグ: ${tagNames.join(', ')}`)
                }
              })
              
            } else {
              console.log(`✗ 「${selectedTag}」タグ: データなし`)
            }
            
          } catch (parseError) {
            console.log(`✗ 「${selectedTag}」タグ: JSON解析エラー`)
          }
          
        } else {
          console.log(`✗ 「${selectedTag}」タグ: meta tagなし`)
        }
        
      } else {
        console.log(`✗ 「${selectedTag}」タグページ取得失敗: ${proxyData.status}`)
      }
      
    } catch (error) {
      console.error(`「${selectedTag}」タグエラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
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
  
  console.log(`\n🎯 HTMLページから直接データ抽出により、両ジャンルの詳細情報取得完了`)
}

extractFromHtmlPages().catch(console.error)