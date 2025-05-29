// r18ジャンルのテスト
async function testR18Genre() {
  console.log('=== Testing R18 Genre ===');
  
  // 1. nvAPIでr18ジャンルにアクセス
  console.log('\n1. Testing nvAPI...');
  try {
    const response = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/r18?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/'
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`Items: ${data.data?.items?.length || 0}`);
    } else {
      const text = await response.text();
      console.log('Error response:', text.substring(0, 200));
    }
  } catch (error) {
    console.log('nvAPI error:', error.message);
  }
  
  // 2. HTMLでr18ジャンルにアクセス
  console.log('\n2. Testing HTML scraping...');
  try {
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/r18?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const html = await response.text();
      console.log('HTML length:', html.length);
      
      // タイトルを確認
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        console.log('Page title:', titleMatch[1]);
      }
      
      // エラーメッセージを探す
      if (html.includes('アクセスできません') || html.includes('制限')) {
        console.log('⚠️ Access restriction detected');
      }
    }
  } catch (error) {
    console.log('HTML error:', error.message);
  }
  
  // 3. 人気タグAPIでr18ジャンル
  console.log('\n3. Testing popular tags API...');
  try {
    const response = await fetch('https://nvapi.nicovideo.jp/v1/genres/r18/popular-tags', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/'
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log('Popular tags:', data.data?.tags?.slice(0, 5));
    }
  } catch (error) {
    console.log('Popular tags error:', error.message);
  }
}

testR18Genre();