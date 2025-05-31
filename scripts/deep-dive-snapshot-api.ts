// スナップショットAPIを徹底的に調査

async function deepDiveSnapshotAPI() {
  console.log('=== スナップショットAPI徹底調査 ===\n')
  
  // 1. ジャンルIDの確認
  console.log('1. 様々なジャンルIDでテスト')
  const genreTests = [
    { id: 'd2um7mc4', name: '例のソレ（小文字）' },
    { id: 'D2UM7MC4', name: '例のソレ（大文字）' },
    { id: '例のソレ', name: '例のソレ（日本語）' },
    { id: 'ramuboyn', name: 'その他' },
    { id: 'all', name: '総合' }
  ]
  
  for (const genre of genreTests) {
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tags&fields=contentId,title&filters[genre][0]=${genre.id}&_limit=1`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      console.log(`\n${genre.name} (${genre.id}): ${data.meta?.totalCount || 0}件`)
    } catch (error) {
      console.log(`${genre.name}: エラー`)
    }
  }
  
  // 2. フィルターなしで例のソレ動画を探す
  console.log('\n\n2. タグで例のソレコンテンツを検索')
  const reisoreTags = ['R-18', 'MMD', '紳士向け', 'ボイロAV']
  
  for (const tag of reisoreTags) {
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=${encodeURIComponent(tag)}&targets=tagsExact&fields=contentId,title,viewCounter,tags,genre&_sort=-viewCounter&_limit=5`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      
      console.log(`\n「${tag}」タグ: ${data.meta?.totalCount}件`)
      
      if (data.data && data.data.length > 0) {
        // ジャンル情報を確認
        const genres = new Set()
        data.data.forEach((item: any) => {
          if (item.genre) {
            genres.add(item.genre)
          }
        })
        console.log(`含まれるジャンル: ${Array.from(genres).join(', ')}`)
        
        // 最初の動画
        const first = data.data[0]
        console.log(`例: ${first.title}`)
        console.log(`   ジャンル: ${first.genre || '不明'}`)
      }
    } catch (error) {
      console.log(`${tag}: エラー`)
    }
  }
  
  // 3. ジャンルフィールドの正しい指定方法を探る
  console.log('\n\n3. ジャンルフィルターの様々な指定方法')
  const filterPatterns = [
    'filters[genre][0]=d2um7mc4',
    'filters[genre]=d2um7mc4',
    'filters[genreId][0]=d2um7mc4',
    'filters[genreId]=d2um7mc4',
    'jsonFilter=' + encodeURIComponent(JSON.stringify({genre: ['d2um7mc4']})),
    'jsonFilter=' + encodeURIComponent(JSON.stringify({genre: 'd2um7mc4'}))
  ]
  
  for (const pattern of filterPatterns) {
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tags&fields=contentId,title&${pattern}&_limit=1`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      console.log(`\n${pattern}: ${data.meta?.totalCount || 0}件`)
    } catch (error) {
      console.log(`${pattern}: エラー`)
    }
  }
  
  // 4. APIドキュメントの推測
  console.log('\n\n4. APIドキュメントURLの推測')
  const docUrls = [
    'https://snapshot.search.nicovideo.jp/docs',
    'https://snapshot.search.nicovideo.jp/api/docs',
    'https://snapshot.search.nicovideo.jp/api/v2/docs',
    'https://site.nicovideo.jp/search-api-docs/'
  ]
  
  for (const url of docUrls) {
    try {
      const response = await fetch(url)
      console.log(`${url}: ${response.status}`)
    } catch (error) {
      console.log(`${url}: エラー`)
    }
  }
  
  // 5. 実際の解決策
  console.log('\n\n5. 🎯 発見した解決策')
  console.log('スナップショットAPIではジャンルフィルターが効かない可能性')
  console.log('代わりに、タグ検索で例のソレコンテンツを取得し、')
  console.log('再生数や投稿時間でソートすることでランキングを作成する')
}

deepDiveSnapshotAPI().catch(console.error)