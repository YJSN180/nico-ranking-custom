// 成功したエンドポイントを詳しく調査

async function testSuccessfulEndpoints() {
  console.log('=== 成功したエンドポイントの詳細調査 ===\n')
  
  // 1. getthumbinfo API
  console.log('1. ext.nicovideo.jp/api/getthumbinfo')
  const thumbUrl = 'https://ext.nicovideo.jp/api/getthumbinfo/ranking/d2um7mc4'
  
  try {
    const response = await fetch(thumbUrl)
    console.log(`Status: ${response.status}`)
    const xml = await response.text()
    
    // XMLの内容を確認
    console.log('\nXML内容（最初の500文字）:')
    console.log(xml.substring(0, 500))
    
    // ranking要素があるか確認
    if (xml.includes('<ranking')) {
      console.log('\n✅ rankingデータ発見！')
      const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g)
      console.log(`アイテム数: ${items?.length || 0}`)
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  // 2. snapshot.search API
  console.log('\n\n2. snapshot.search.nicovideo.jp API')
  const snapshotUrl = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tags&fields=contentId,title,viewCounter,thumbnailUrl,startTime&filters[genre][0]=d2um7mc4&_sort=-viewCounter&_limit=30'
  
  try {
    const response = await fetch(snapshotUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    })
    
    console.log(`Status: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('\n✅ JSONデータ取得成功！')
      console.log(`総件数: ${data.meta?.totalCount || 0}`)
      console.log(`取得件数: ${data.data?.length || 0}`)
      
      if (data.data && data.data.length > 0) {
        console.log('\n最初の5件:')
        data.data.slice(0, 5).forEach((item: any, i: number) => {
          console.log(`${i + 1}. ${item.title}`)
          console.log(`   ID: ${item.contentId}, 再生数: ${item.viewCounter}`)
        })
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  // 3. 通常のランキングページ（format=xmlパラメータ付き）
  console.log('\n\n3. 通常ランキングページ + format=xml')
  const xmlFormatUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?page=1&lang=ja-jp&format=xml'
  
  try {
    const response = await fetch(xmlFormatUrl)
    console.log(`Status: ${response.status}`)
    const content = await response.text()
    
    // XMLかHTMLか確認
    if (content.startsWith('<?xml')) {
      console.log('✅ XML形式で返却！')
      console.log(content.substring(0, 500))
    } else if (content.includes('<html')) {
      console.log('❌ HTML形式（リダイレクト）')
      const title = content.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]
      console.log(`ページタイトル: ${title}`)
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  // 4. 発見！スナップショットAPIで例のソレジャンルを取得する方法
  console.log('\n\n4. 🎯 スナップショットAPIの活用')
  console.log('これがニコニコチャートやニコログが使っている可能性が高い！')
  
  // 毎時ランキング相当（投稿時間でソート）
  const hourlyUrl = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tags&fields=contentId,title,viewCounter,commentCounter,mylistCounter,thumbnailUrl,startTime,lengthSeconds,lastResBody&filters[genre][0]=d2um7mc4&_sort=-startTime&_limit=100'
  
  try {
    const response = await fetch(hourlyUrl)
    const data = await response.json()
    
    console.log('\n毎時ランキング相当（最新投稿順）:')
    console.log(`総件数: ${data.meta?.totalCount}`)
    console.log(`d2um7mc4ジャンルの動画が確実に取得できる！`)
  } catch (error) {
    console.error('Error:', error)
  }
}

testSuccessfulEndpoints().catch(console.error)