// デバイス制限されている動画の調査
async function testMissingVideos() {
  console.log('=== Checking for missing videos in ranking ===');
  
  // 実際の4位と5位のタイトル
  const missing4th = "機動戦士Gundam G糞uuuuuuX(ジークソクス)OP Ksodva";
  const missing5th = "静電気ドッキリを仕掛けるタクヤさん";
  
  // 現在のAPIレスポンスを確認
  const response = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=24h', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0',
      'Referer': 'https://www.nicovideo.jp/',
    }
  });
  
  const data = await response.json();
  const items = data.data?.items || [];
  
  console.log(`Total items returned: ${items.length}`);
  console.log('\nFirst 10 titles:');
  items.slice(0, 10).forEach((item, i) => {
    console.log(`${i+1}. ${item.title}`);
  });
  
  // タイトルで検索
  const found4th = items.find(item => item.title.includes('Gundam') || item.title.includes('ジークソクス'));
  const found5th = items.find(item => item.title.includes('静電気') || item.title.includes('ドッキリ'));
  
  console.log(`\n4位 "${missing4th}": ${found4th ? '見つかった' : '見つからない'}`);
  console.log(`5位 "${missing5th}": ${found5th ? '見つかった' : '見つからない'}`);
  
  // 異なるAPIバージョンをテスト
  console.log('\n=== Testing different API versions ===');
  
  // v2 APIを試す
  try {
    const v2Response = await fetch('https://nvapi.nicovideo.jp/v2/ranking/genre/other?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    });
    console.log('v2 API status:', v2Response.status);
  } catch (error) {
    console.log('v2 API failed:', error.message);
  }
  
  // Cookieを使ったアプローチのテスト準備
  console.log('\n=== Cookie-based approach test ===');
  console.log('センシティブコンテンツを表示するには、以下が必要な可能性があります:');
  console.log('1. user_session cookie');
  console.log('2. sensitive_viewing=1 のような設定cookie');
  console.log('3. age_auth=1 のような年齢認証cookie');
  
  // センシティブ設定を含むヘッダーのテスト
  const sensitiveHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'X-Frontend-Id': '6',
    'X-Frontend-Version': '0',
    'X-Nicovideo-Language': 'ja-jp',
    'X-Request-With': 'https://www.nicovideo.jp',
    'Referer': 'https://www.nicovideo.jp/ranking/genre/other?term=24h',
    // センシティブコンテンツ関連のヘッダーを試す
    'X-Nicovideo-Content-Restriction': '0',
    'X-Nicovideo-Age-Verification': '1',
    'X-Nicovideo-Sensitive-Content': 'true',
  };
  
  console.log('\n=== Testing with sensitive headers ===');
  try {
    const sensitiveResponse = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=24h', {
      headers: sensitiveHeaders
    });
    
    const sensitiveData = await sensitiveResponse.json();
    console.log('Response with sensitive headers:', sensitiveData.data?.items?.length, 'items');
    
    // 最初の数件を確認
    if (sensitiveData.data?.items) {
      console.log('First 5 items:');
      sensitiveData.data.items.slice(0, 5).forEach((item, i) => {
        console.log(`${i+1}. ${item.title}`);
      });
    }
  } catch (error) {
    console.log('Sensitive headers test failed:', error.message);
  }
  
  // Public APIのテスト
  console.log('\n=== Testing public.api.nicovideo.jp ===');
  try {
    const publicResponse = await fetch('https://public.api.nicovideo.jp/v1/ranking/genre/other.json?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    console.log('Public API status:', publicResponse.status);
    if (publicResponse.ok) {
      const text = await publicResponse.text();
      console.log('Response preview:', text.substring(0, 200));
    }
  } catch (error) {
    console.log('Public API failed:', error.message);
  }
}

testMissingVideos();