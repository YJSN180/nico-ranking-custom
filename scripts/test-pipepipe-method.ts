// PipePipeアプリの方法で__NEXT_DATA__から例のソレジャンルのランキングを取得

async function testPipePipeMethod() {
  console.log('=== PipePipe方式（__NEXT_DATA__）で例のソレランキング取得テスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  const urls = [
    {
      name: '例のソレ 毎時総合',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour'
    },
    {
      name: '例のソレ 24時間総合',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
    },
    {
      name: '例のソレ R-18タグ',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?tag=R-18&term=hour'
    },
    {
      name: '比較：その他 毎時総合',
      url: 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour'
    }
  ]
  
  for (const urlInfo of urls) {
    console.log(`\n=== ${urlInfo.name} ===`)
    console.log(`URL: ${urlInfo.url}`)
    
    try {
      const response = await fetch(urlInfo.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const html = await response.text()
        
        // ページタイトルを確認
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
        if (titleMatch) {
          console.log(`Page title: ${titleMatch[1]}`)
        }
        
        // __NEXT_DATA__を探す
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
        
        if (nextDataMatch) {
          console.log('✅ __NEXT_DATA__を発見！')
          
          try {
            const nextData = JSON.parse(nextDataMatch[1])
            console.log('✅ JSONパース成功')
            
            // データ構造を探索
            console.log('\nデータ構造:')
            console.log('- props:', Object.keys(nextData.props || {}))
            console.log('- pageProps:', Object.keys(nextData.props?.pageProps || {}))
            
            // ランキングデータを探す
            const pageProps = nextData.props?.pageProps
            
            // 様々な可能性のある場所を探索
            const possiblePaths = [
              pageProps?.ranking,
              pageProps?.rankingData,
              pageProps?.data,
              pageProps?.initialData,
              pageProps?.serverState,
              pageProps?.dehydratedState
            ]
            
            for (const data of possiblePaths) {
              if (data) {
                console.log('\n📊 データ発見:', Object.keys(data).slice(0, 10))
                
                // ランキングアイテムを探す
                if (data.items || data.rankings || data.videos) {
                  const items = data.items || data.rankings || data.videos
                  console.log(`\nランキングアイテム数: ${items.length}`)
                  
                  // 最初の5件を表示
                  console.log('\n最初の5件:')
                  items.slice(0, 5).forEach((item: any, i: number) => {
                    console.log(`${i + 1}. ${item.title || item.name || 'タイトル不明'}`)
                    if (item.id || item.videoId || item.contentId) {
                      console.log(`   ID: ${item.id || item.videoId || item.contentId}`)
                    }
                    if (item.views || item.viewCount || item.count?.view) {
                      console.log(`   再生数: ${(item.views || item.viewCount || item.count?.view).toLocaleString()}`)
                    }
                  })
                  
                  // 例のソレジャンルかどうか確認
                  if (urlInfo.name.includes('例のソレ')) {
                    const hasReiSoreContent = items.some((item: any) => {
                      const title = item.title || item.name || ''
                      return title.includes('R-18') || 
                             title.includes('紳士向け') || 
                             title.includes('MMD') ||
                             title.includes('メスガキ')
                    })
                    
                    if (hasReiSoreContent) {
                      console.log('\n🎯 例のソレコンテンツを検出！')
                    }
                  }
                  
                  break
                }
              }
            }
            
            // ジャンル情報を確認
            if (pageProps?.genre || pageProps?.genreId) {
              console.log(`\nジャンル情報: ${pageProps.genre || pageProps.genreId}`)
            }
            
            // HTMLサンプルを保存（詳細分析用）
            if (urlInfo.name === '例のソレ 毎時総合') {
              const fs = await import('fs')
              fs.writeFileSync('nextdata-reisore-sample.json', JSON.stringify(nextData, null, 2))
              console.log('\n💾 __NEXT_DATA__を保存しました')
            }
            
          } catch (e) {
            console.log('❌ JSONパースエラー:', e)
          }
        } else {
          console.log('❌ __NEXT_DATA__が見つかりません')
          
          // 他の形式のデータを探す
          const remixMatch = html.match(/window\.__remixContext\s*=\s*({[\s\S]+?});/)
          if (remixMatch) {
            console.log('📊 Remixデータを発見（Next.jsではなくRemix）')
          }
          
          const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
          if (serverResponseMatch) {
            console.log('📊 server-responseメタタグを発見')
            
            try {
              // HTMLエンティティをデコード
              const decodedContent = serverResponseMatch[1]
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
              
              const serverData = JSON.parse(decodedContent)
              console.log('✅ server-response JSONパース成功')
              
              // データ構造を探索
              console.log('\nserver-responseデータ構造:')
              console.log('- meta:', serverData.meta)
              console.log('- data keys:', Object.keys(serverData.data || {}))
              
              // ランキングデータを探す
              const data = serverData.data
              if (data?.rankingItems || data?.items || data?.videos) {
                const items = data.rankingItems || data.items || data.videos
                console.log(`\nランキングアイテム数: ${items.length}`)
                
                // 最初の5件を表示
                console.log('\n最初の5件:')
                items.slice(0, 5).forEach((item: any, i: number) => {
                  console.log(`${i + 1}. ${item.title || item.video?.title || 'タイトル不明'}`)
                  if (item.id || item.video?.id || item.contentId) {
                    console.log(`   ID: ${item.id || item.video?.id || item.contentId}`)
                  }
                  if (item.count?.view || item.viewCounter || item.video?.count?.view) {
                    console.log(`   再生数: ${(item.count?.view || item.viewCounter || item.video?.count?.view).toLocaleString()}`)
                  }
                })
              }
              
              // ジャンル情報を確認
              if (data?.genre || data?.genreId || data?.metadata?.genre) {
                console.log(`\nジャンル情報: ${data.genre || data.genreId || data.metadata?.genre}`)
              }
              
              // 詳細を保存
              if (urlInfo.name === '例のソレ 毎時総合') {
                const fs = await import('fs')
                fs.writeFileSync('server-response-reisore.json', JSON.stringify(serverData, null, 2))
                console.log('\n💾 server-responseデータを保存しました')
              }
            } catch (e) {
              console.log('❌ server-response解析エラー:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testPipePipeMethod().catch(console.error)