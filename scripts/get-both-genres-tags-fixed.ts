#!/usr/bin/env tsx

// 修正版: その他と例のソレジャンルの人気タグ取得

async function getBothGenresTagsFixed() {
  console.log('=== 修正版: 両ジャンルの人気タグとタグ別ランキング取得 ===')
  
  const mobileHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json;charset=utf-8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Origin': 'https://sp.nicovideo.jp',
    'Referer': 'https://sp.nicovideo.jp/',
    'X-Client-Os-Type': 'ios',
    'X-Frontend-Id': '3',
    'X-Frontend-Version': '',
    'X-Niconico-Language': 'ja-jp',
    'Cookie': 'nicosid=1725186023.265332462; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP'
  }
  
  const genres = [
    { name: 'その他', id: 'ramuboyn' },
    { name: '例のソレ', id: 'd2um7mc4' }
  ]
  
  const genreResults: any = {}
  
  // 各ジャンルのランキング取得
  for (const genre of genres) {
    console.log(`\n=== ${genre.name}ジャンル (${genre.id}) ===`)
    
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
          headers: mobileHeaders
        }),
      })

      const proxyData = await response.json()
      console.log(`プロキシレスポンス status: ${proxyData.status}`)
      
      // statusCodeではなくstatusを使用
      if (proxyData.status === 200) {
        try {
          const rankingData = JSON.parse(proxyData.body)
          
          if (rankingData.data?.items) {
            console.log(`✅ ${genre.name}ジャンル取得成功`)
            console.log(`  ジャンルラベル: ${rankingData.data.label}`)
            console.log(`  動画数: ${rankingData.data.items.length}`)
            
            // 動画のタグから人気タグを集計
            const tagCounts: any = {}
            
            rankingData.data.items.forEach((item: any) => {
              if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach((tag: any) => {
                  const tagName = tag.name || tag
                  if (tagName && 
                      typeof tagName === 'string' && 
                      tagName.length > 0 && 
                      tagName.length < 20 &&
                      !tagName.includes('http') &&
                      !tagName.includes('www')) {
                    tagCounts[tagName] = (tagCounts[tagName] || 0) + 1
                  }
                })
              }
            })
            
            // 人気タグトップ15を取得
            const popularTags = Object.entries(tagCounts)
              .sort(([,a], [,b]) => (b as number) - (a as number))
              .slice(0, 15)
              .map(([tag, count]) => ({ tag, count }))
            
            console.log(`\n📊 ${genre.name}ジャンル 人気タグ TOP 15:`)
            popularTags.forEach((item: any, index) => {
              console.log(`  ${index + 1}. ${item.tag} (${item.count}回出現)`)
            })
            
            // 選択するタグ（1位のタグを選択）
            const selectedTag = popularTags[0]?.tag || null
            
            genreResults[genre.id] = {
              name: genre.name,
              popularTags: popularTags,
              selectedTag: selectedTag,
              sampleVideos: rankingData.data.items.slice(0, 3).map((item: any) => ({
                title: item.title,
                id: item.id,
                views: item.count?.view || 0
              }))
            }
            
            console.log(`\n🎯 選択されたタグ: 「${selectedTag}」`)
            
          } else {
            console.log(`✗ ${genre.name}ジャンル: データ構造が不正`)
            console.log('レスポンス構造:', Object.keys(rankingData))
          }
          
        } catch (parseError) {
          console.log(`✗ ${genre.name}ジャンル: JSON解析エラー`, parseError)
          console.log('生データ（最初の200文字）:', proxyData.body.substring(0, 200))
        }
        
      } else {
        console.log(`✗ ${genre.name}ジャンル: API失敗 ${proxyData.status}`)
        console.log('エラー:', proxyData.body)
      }
      
    } catch (error) {
      console.error(`${genre.name}ジャンルエラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // 各ジャンルの選択されたタグでランキングを取得
  console.log('\n' + '='.repeat(60))
  console.log('=== タグ別ランキング取得（上位10動画ずつ） ===')
  console.log('='.repeat(60))
  
  for (const genreId of Object.keys(genreResults)) {
    const genreInfo = genreResults[genreId]
    const selectedTag = genreInfo.selectedTag
    
    if (!selectedTag) {
      console.log(`${genreInfo.name}: 人気タグが見つかりませんでした`)
      continue
    }
    
    console.log(`\n🏆 ${genreInfo.name}ジャンル「${selectedTag}」タグランキング TOP 10`)
    console.log('-'.repeat(50))
    
    try {
      const tagUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genreId}?term=24h&page=1&pageSize=10&tag=${encodeURIComponent(selectedTag)}`
      
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: tagUrl,
          headers: mobileHeaders
        }),
      })

      const proxyData = await response.json()
      
      if (proxyData.status === 200) {
        try {
          const tagRankingData = JSON.parse(proxyData.body)
          
          if (tagRankingData.data?.items) {
            console.log(`✅ 「${selectedTag}」タグランキング取得成功`)
            console.log(`タグ設定確認: ${tagRankingData.data.tag || 'なし'}`)
            console.log(`取得動画数: ${tagRankingData.data.items.length}`)
            
            tagRankingData.data.items.slice(0, 10).forEach((item: any, index: number) => {
              console.log(`\n${index + 1}位: ${item.title}`)
              console.log(`  動画ID: ${item.id}`)
              console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
              console.log(`  コメント数: ${item.count?.comment?.toLocaleString() || '不明'}件`)
              console.log(`  マイリスト数: ${item.count?.mylist?.toLocaleString() || '不明'}件`)
              console.log(`  投稿者: ${item.owner?.name || '不明'} (ID: ${item.owner?.id || '不明'})`)
              console.log(`  投稿日時: ${item.registeredAt || '不明'}`)
              console.log(`  動画時間: ${item.duration ? Math.floor(item.duration / 60) + '分' + (item.duration % 60) + '秒' : '不明'}`)
              console.log(`  サムネイル: ${item.thumbnail?.url || '不明'}`)
              console.log(`  視聴URL: https://www.nicovideo.jp/watch/${item.id}`)
              
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
            const views = tagRankingData.data.items.map((item: any) => item.count?.view || 0)
            const totalViews = views.reduce((sum: number, view: number) => sum + view, 0)
            const avgViews = Math.round(totalViews / views.length)
            const maxViews = Math.max(...views)
            const minViews = Math.min(...views)
            
            console.log(`\n📊 ${genreInfo.name}ジャンル「${selectedTag}」統計情報:`)
            console.log(`  総再生数: ${totalViews.toLocaleString()}回`)
            console.log(`  平均再生数: ${avgViews.toLocaleString()}回`)
            console.log(`  最高再生数: ${maxViews.toLocaleString()}回`)
            console.log(`  最低再生数: ${minViews.toLocaleString()}回`)
            
          } else {
            console.log(`✗ 「${selectedTag}」タグランキング: データが空`)
          }
          
        } catch (parseError) {
          console.log(`✗ 「${selectedTag}」JSON解析エラー:`, parseError)
        }
        
      } else {
        console.log(`✗ 「${selectedTag}」タグランキング失敗: ${proxyData.status}`)
        console.log('エラー詳細:', proxyData.body)
      }
      
    } catch (error) {
      console.error(`「${selectedTag}」タグランキングエラー:`, error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // 最終サマリー
  console.log('\n' + '='.repeat(60))
  console.log('=== 最終サマリー ===')
  console.log('='.repeat(60))
  
  Object.values(genreResults).forEach((genre: any) => {
    console.log(`\n${genre.name}ジャンル:`)
    console.log(`  選択タグ: 「${genre.selectedTag}」`)
    console.log(`  人気タグ数: ${genre.popularTags.length}`)
    
    if (genre.popularTags.length >= 5) {
      const topTags = genre.popularTags.slice(0, 5).map((item: any) => `${item.tag}(${item.count})`)
      console.log(`  上位5タグ: ${topTags.join(', ')}`)
    }
    
    if (genre.sampleVideos.length > 0) {
      console.log(`  サンプル動画:`)
      genre.sampleVideos.forEach((video: any, index: number) => {
        console.log(`    ${index + 1}. ${video.title} (${video.views.toLocaleString()}回再生)`)
      })
    }
  })
  
  console.log('\n🎯 完了: 両ジャンルのタグ別ランキング取得成功')
  console.log('各ジャンルの最も人気のあるタグで上位10動画を取得しました')
}

getBothGenresTagsFixed().catch(console.error)