// センシティブコンテンツのAPI調査
async function testSensitiveContent() {
  const genre = 'other';
  const baseUrl = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}`;
  
  // テスト1: 基本的なリクエスト
  console.log('=== Test 1: Basic Request ===');
  try {
    const response1 = await fetch(`${baseUrl}?term=24h`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    });
    
    const data1 = await response1.json();
    console.log('Total items:', data1.data?.items?.length);
    console.log('First few items:', data1.data?.items?.slice(0, 5).map((item, i) => 
      `${i+1}. ${item.title} (${item.id})`
    ));
  } catch (error) {
    console.error('Test 1 failed:', error);
  }

  // テスト2: 異なるX-Frontend-Idを試す
  console.log('\n=== Test 2: Different X-Frontend-Id ===');
  const frontendIds = ['1', '3', '6', '9', '10', '70', '76'];
  
  for (const id of frontendIds) {
    try {
      const response = await fetch(`${baseUrl}?term=24h`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': id,
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      });
      
      const data = await response.json();
      console.log(`Frontend-Id ${id}: ${data.data?.items?.length || 0} items`);
    } catch (error) {
      console.log(`Frontend-Id ${id}: Failed`);
    }
  }

  // テスト3: 追加パラメータを試す
  console.log('\n=== Test 3: Additional Parameters ===');
  const params = [
    'sensitive=1',
    'sensitive=true',
    'adult=1',
    'restricted=0',
    'device_filter=0',
    'content_filter=0',
    '_limit=300'
  ];
  
  for (const param of params) {
    try {
      const response = await fetch(`${baseUrl}?term=24h&${param}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      });
      
      const data = await response.json();
      if (data.meta?.status === 200) {
        console.log(`Param "${param}": ${data.data?.items?.length || 0} items`);
      } else {
        console.log(`Param "${param}": Status ${data.meta?.status}`);
      }
    } catch (error) {
      console.log(`Param "${param}": Failed`);
    }
  }

  // テスト4: 異なるUser-Agentを試す
  console.log('\n=== Test 4: Different User-Agents ===');
  const userAgents = [
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Niconico/1.0 (Nintendo Switch; WebApplet)',
    'niconicoapp/1.0 (iOS 16.0; iPhone13,2)',
  ];
  
  for (const ua of userAgents) {
    try {
      const response = await fetch(`${baseUrl}?term=24h`, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      });
      
      const data = await response.json();
      const uaShort = ua.split(' ')[0];
      console.log(`${uaShort}: ${data.data?.items?.length || 0} items`);
    } catch (error) {
      const uaShort = ua.split(' ')[0];
      console.log(`${uaShort}: Failed`);
    }
  }
}

testSensitiveContent();