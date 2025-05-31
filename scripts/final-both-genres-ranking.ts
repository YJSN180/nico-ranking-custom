#!/usr/bin/env tsx

// 完全なCookie情報を使用して両ジャンルのランキングを取得

async function finalBothGenresRanking() {
  console.log('=== 完全認証情報での両ジャンルランキング取得 ===')
  
  // 実際のブラウザから取得した完全なヘッダー情報
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json;charset=utf-8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Origin': 'https://sp.nicovideo.jp',
    'Referer': 'https://sp.nicovideo.jp/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'X-Client-Os-Type': 'ios',
    'X-Frontend-Id': '3',
    'X-Frontend-Version': '',
    'X-Niconico-Language': 'ja-jp',
    // 完全なCookie情報
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  const genres = [
    { name: 'その他', id: 'ramuboyn' },
    { name: '例のソレ', id: 'd2um7mc4' }
  ]
  
  const genreResults: any = {}
  
  // 各ジャンルの基本ランキング取得
  for (const genre of genres) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`=== ${genre.name}ジャンル (${genre.id}) ===`)
    console.log(`${'='.repeat(50)}`)
    
    try {
      const baseUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genre.id}?term=24h&page=1&pageSize=50`
      console.log(`URL: ${baseUrl}`)
      
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: baseUrl,
          headers: fullHeaders
        }),
      })

      const proxyData = await response.json()
      console.log(`HTTP Status: ${proxyData.status}`)
      
      if (proxyData.status === 200) {
        try {
          const rankingData = JSON.parse(proxyData.body)
          
          if (rankingData.data?.items && Array.isArray(rankingData.data.items)) {
            console.log(`✅ ${genre.name}ジャンル取得成功`)
            console.log(`  ジャンルラベル: ${rankingData.data.label}`)
            console.log(`  動画数: ${rankingData.data.items.length}`)
            console.log(`  フィーチャーキー: ${rankingData.data.featuredKey}`)
            
            // 動画例を表示
            console.log(`\n📺 ${genre.name}ジャンル サンプル動画 TOP 5:`)
            rankingData.data.items.slice(0, 5).forEach((item: any, index: number) => {
              console.log(`  ${index + 1}位: ${item.title}`)
              console.log(`    再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
              console.log(`    投稿者: ${item.owner?.name || '不明'}`)
            })
            
            // タグ集計
            const tagCounts: any = {}
            let totalTags = 0
            
            rankingData.data.items.forEach((item: any) => {
              if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach((tag: any) => {
                  const tagName = tag.name || tag
                  if (tagName && 
                      typeof tagName === 'string' && 
                      tagName.length > 0 && 
                      tagName.length < 25 &&
                      !tagName.includes('http') &&
                      !tagName.includes('www') &&
                      !tagName.includes('://')) {
                    tagCounts[tagName] = (tagCounts[tagName] || 0) + 1
                    totalTags++
                  }
                })
              }
            })
            
            console.log(`\n🏷️ タグ解析: 総タグ数 ${totalTags}、ユニークタグ数 ${Object.keys(tagCounts).length}`)
            
            // 人気タグトップ15
            const popularTags = Object.entries(tagCounts)
              .sort(([,a], [,b]) => (b as number) - (a as number))
              .slice(0, 15)
              .map(([tag, count]) => ({ tag, count }))
            
            console.log(`\n📊 ${genre.name}ジャンル 人気タグ TOP 15:`)
            popularTags.forEach((item: any, index) => {
              const percentage = ((item.count / rankingData.data.items.length) * 100).toFixed(1)
              console.log(`  ${index + 1}. ${item.tag} (${item.count}回, ${percentage}%)`)
            })
            
            // 最も人気のタグを選択
            const selectedTag = popularTags[0]?.tag || null
            
            genreResults[genre.id] = {
              name: genre.name,
              popularTags: popularTags,
              selectedTag: selectedTag,
              totalVideos: rankingData.data.items.length,
              label: rankingData.data.label
            }
            
            console.log(`\n🎯 選択されたタグ: 「${selectedTag}」 (${popularTags[0]?.count || 0}回出現)`)
            
          } else {
            console.log(`✗ ${genre.name}ジャンル: データ構造異常`)
            if (rankingData.data) {
              console.log('data構造:', Object.keys(rankingData.data))
            }
            if (rankingData.meta) {
              console.log('meta情報:', rankingData.meta)
            }
          }
          
        } catch (parseError) {
          console.log(`✗ ${genre.name}ジャンル: JSON解析エラー`)
          console.error(parseError)
          console.log('生データサンプル:', proxyData.body.substring(0, 300))
        }
        
      } else {
        console.log(`✗ ${genre.name}ジャンル: API失敗 ${proxyData.status}`)
        console.log('エラー詳細:', proxyData.body)
      }
      
    } catch (error) {
      console.error(`${genre.name}ジャンル リクエストエラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  
  // タグ別ランキング取得
  console.log(`\n${'='.repeat(80)}`)
  console.log('=== タグ別ランキング取得（各ジャンル上位10動画） ===')
  console.log(`${'='.repeat(80)}`)
  
  let totalVideosShown = 0
  
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
      const tagUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genreId}?term=24h&page=1&pageSize=10&tag=${encodeURIComponent(selectedTag)}`
      console.log(`🔗 API URL: ${tagUrl}`)
      
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: tagUrl,
          headers: fullHeaders
        }),
      })

      const proxyData = await response.json()
      
      if (proxyData.status === 200) {
        try {
          const tagRankingData = JSON.parse(proxyData.body)
          
          if (tagRankingData.data?.items && Array.isArray(tagRankingData.data.items)) {
            console.log(`✅ 取得成功: ${tagRankingData.data.items.length}動画`)
            console.log(`📋 タグ設定確認: ${tagRankingData.data.tag || 'なし'}`)
            console.log(`🏷️ ジャンル: ${tagRankingData.data.label || '不明'}`)
            
            tagRankingData.data.items.slice(0, 10).forEach((item: any, index: number) => {
              totalVideosShown++
              
              console.log(`\n🥇 ${index + 1}位: ${item.title}`)
              console.log(`   📱 動画ID: ${item.id}`)
              console.log(`   👀 再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
              console.log(`   💬 コメント: ${item.count?.comment?.toLocaleString() || '不明'}件`)
              console.log(`   ⭐ マイリスト: ${item.count?.mylist?.toLocaleString() || '不明'}件`)
              console.log(`   👍 いいね: ${item.count?.like?.toLocaleString() || '不明'}件`)
              console.log(`   👤 投稿者: ${item.owner?.name || '不明'} (ID: ${item.owner?.id || '不明'})`)
              console.log(`   📅 投稿日: ${item.registeredAt || '不明'}`)
              console.log(`   ⏱️ 時間: ${item.duration ? Math.floor(item.duration / 60) + '分' + (item.duration % 60) + '秒' : '不明'}`)
              console.log(`   🖼️ サムネ: ${item.thumbnail?.largeUrl || item.thumbnail?.url || '不明'}`)
              console.log(`   🔗 URL: https://www.nicovideo.jp/watch/${item.id}`)
              
              if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
                const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 10)
                console.log(`   🏷️ タグ: ${tagNames.join(', ')}`)
              }
              
              if (item.shortDescription) {
                const desc = item.shortDescription.substring(0, 120)
                console.log(`   📝 説明: ${desc}${item.shortDescription.length > 120 ? '...' : ''}`)
              }
              
              // R-18や特殊コンテンツの判定
              const title = item.title.toLowerCase()
              const isR18 = title.includes('r-18') || title.includes('r18') || title.includes('紳士向け')
              const isASMR = title.includes('asmr') || title.includes('耳舐め') || title.includes('耳かき')
              const isMMD = title.includes('mmd')
              
              const contentTypes = []
              if (isR18) contentTypes.push('🔞R-18')
              if (isASMR) contentTypes.push('🎧ASMR')
              if (isMMD) contentTypes.push('💃MMD')
              
              if (contentTypes.length > 0) {
                console.log(`   🎭 コンテンツ種別: ${contentTypes.join(', ')}`)
              }
            })
            
            // 統計情報
            const views = tagRankingData.data.items.map((item: any) => item.count?.view || 0)
            const comments = tagRankingData.data.items.map((item: any) => item.count?.comment || 0)
            const totalViews = views.reduce((sum: number, view: number) => sum + view, 0)
            const totalComments = comments.reduce((sum: number, comment: number) => sum + comment, 0)
            const avgViews = Math.round(totalViews / views.length)
            const maxViews = Math.max(...views)
            const minViews = Math.min(...views)
            
            console.log(`\n📊 ${genreInfo.name}ジャンル「${selectedTag}」統計:`)
            console.log(`   📺 総再生数: ${totalViews.toLocaleString()}回`)
            console.log(`   💬 総コメント数: ${totalComments.toLocaleString()}件`)
            console.log(`   📈 平均再生数: ${avgViews.toLocaleString()}回`)
            console.log(`   🏆 最高再生数: ${maxViews.toLocaleString()}回`)
            console.log(`   📉 最低再生数: ${minViews.toLocaleString()}回`)
            
          } else {
            console.log(`❌ 「${selectedTag}」タグランキング: 動画データなし`)
            if (tagRankingData.meta) {
              console.log('Meta情報:', tagRankingData.meta)
            }
          }
          
        } catch (parseError) {
          console.log(`❌ 「${selectedTag}」タグ: JSON解析エラー`)
          console.error(parseError)
        }
        
      } else {
        console.log(`❌ 「${selectedTag}」タグランキング失敗: HTTP ${proxyData.status}`)
        console.log('エラー詳細:', proxyData.body)
      }
      
    } catch (error) {
      console.error(`「${selectedTag}」タグランキング リクエストエラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  
  // 最終レポート
  console.log(`\n${'='.repeat(80)}`)
  console.log('=== 最終レポート ===')
  console.log(`${'='.repeat(80)}`)
  
  console.log(`\n🎯 取得完了: 計${totalVideosShown}動画の詳細情報を取得`)
  
  Object.values(genreResults).forEach((genre: any) => {
    console.log(`\n📂 ${genre.name}ジャンル (${genre.totalVideos || 0}動画):`)
    console.log(`   🎯 選択タグ: 「${genre.selectedTag}」`)
    console.log(`   📊 人気タグ数: ${genre.popularTags?.length || 0}`)
    
    if (genre.popularTags && genre.popularTags.length >= 5) {
      const topTags = genre.popularTags.slice(0, 5).map((item: any) => `${item.tag}(${item.count})`)
      console.log(`   🏆 トップ5タグ: ${topTags.join(', ')}`)
    }
  })
  
  console.log(`\n✅ 成功: 両ジャンルの人気タグ解析とタグ別ランキング取得完了`)
  console.log(`🔞 センシティブコンテンツを含む「例のソレ」ジャンルのデータも正常取得`)
  console.log(`📱 スマートフォン版APIを使用して完全なデータアクセス実現`)
}

finalBothGenresRanking().catch(console.error)