// シンプルに例のソレジャンルに直接アクセスできるか検証

async function verifyDirectAccess() {
  console.log('=== 例のソレジャンル直接アクセス検証 ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour'
  
  // 1. 通常のフェッチ
  console.log('1. 通常のフェッチ（ヘッダーなし）')
  try {
    const response = await fetch(url)
    console.log(`Status: ${response.status}`)
    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'タイトル不明'
    console.log(`ページタイトル: ${title}`)
    console.log(`例のソレ？: ${title.includes('例のソレ') ? '✅' : '❌'}`)
  } catch (error) {
    console.error('エラー:', error)
  }
  
  // 2. Cookieあり
  console.log('\n2. Cookie付きフェッチ')
  try {
    const response = await fetch(url, {
      headers: {
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    console.log(`Status: ${response.status}`)
    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'タイトル不明'
    console.log(`ページタイトル: ${title}`)
    console.log(`例のソレ？: ${title.includes('例のソレ') ? '✅' : '❌'}`)
  } catch (error) {
    console.error('エラー:', error)
  }
  
  // 3. フルヘッダー
  console.log('\n3. フルヘッダー付きフェッチ')
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept; user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6',
        'Referer': 'https://www.nicovideo.jp/ranking'
      }
    })
    console.log(`Status: ${response.status}`)
    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'タイトル不明'
    console.log(`ページタイトル: ${title}`)
    console.log(`例のソレ？: ${title.includes('例のソレ') ? '✅' : '❌'}`)
    
    // server-responseの内容確認
    const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
    if (serverResponseMatch) {
      const decoded = serverResponseMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      const data = JSON.parse(decoded)
      const genreId = data.data?.response?.$getTeibanRanking?.data?.featuredKey
      console.log(`返されたジャンルID: ${genreId}`)
      console.log(`正しいジャンル？: ${genreId === 'd2um7mc4' ? '✅' : '❌'}`)
    }
  } catch (error) {
    console.error('エラー:', error)
  }
  
  // 4. Googlebot UA
  console.log('\n4. Googlebot UA')
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)'
      }
    })
    console.log(`Status: ${response.status}`)
    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'タイトル不明'
    console.log(`ページタイトル: ${title}`)
    console.log(`例のソレ？: ${title.includes('例のソレ') ? '✅' : '❌'}`)
  } catch (error) {
    console.error('エラー:', error)
  }
  
  console.log('\n=== 結論 ===')
  console.log('どの方法でも例のソレジャンル（d2um7mc4）に直接アクセスできるか？')
}

verifyDirectAccess().catch(console.error)