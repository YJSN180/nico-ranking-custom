#!/usr/bin/env tsx

import * as fs from 'fs/promises';

// ニコニコチャートやニコログが使用している可能性のあるAPIエンドポイントをテスト

async function testNicoAPI() {
  console.log('ニコニコ動画のAPIエンドポイントをテスト中...\n');

  // 1. 現在のRSSフィード（例のソレジャンル）
  console.log('1. 例のソレジャンルのRSSフィード:');
  try {
    const rssResponse = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=24h&rss=2.0&lang=ja-jp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    
    if (rssResponse.ok) {
      console.log('  ✓ RSS取得成功 (Status:', rssResponse.status, ')');
      const rssText = await rssResponse.text();
      console.log('  - Content-Type:', rssResponse.headers.get('content-type'));
      console.log('  - データサイズ:', rssText.length, 'bytes');
      
      // XMLを解析して動画数を確認
      const itemMatches = rssText.match(/<item>/g);
      console.log('  - 動画数:', itemMatches ? itemMatches.length : 0);
      
      // サンプルデータを保存
      await fs.writeFile('other-genre-rss-sample.xml', rssText, 'utf-8');
      console.log('  - サンプルをother-genre-rss-sample.xmlに保存しました');
    } else {
      console.log('  ✗ RSS取得失敗 (Status:', rssResponse.status, ')');
    }
  } catch (error) {
    console.log('  ✗ エラー:', error);
  }

  // 2. nvapi-server（内部API）のテスト
  console.log('\n2. nvapi-server内部APIのテスト:');
  const nvapiEndpoints = [
    '/v1/genres/other/ranking?duration=24h',
    '/v1/search/genre-tag/ranking?genreKey=other&duration=24h',
    '/v1/ranking/genre/other?duration=24h',
  ];

  for (const endpoint of nvapiEndpoints) {
    try {
      const url = `https://nvapi.nicovideo.jp${endpoint}`;
      console.log(`  - ${endpoint}`);
      
      const response = await fetch(url, {
        headers: {
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      console.log(`    Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`    ✓ 成功 - データ構造:`, Object.keys(data));
      }
    } catch (error) {
      console.log(`    ✗ エラー:`, error.message);
    }
  }

  // 3. 古いスナップショットAPIの確認
  console.log('\n3. スナップショットAPIv2のテスト:');
  try {
    const searchUrl = 'https://api.search.nicovideo.jp/api/v2/snapshot/version';
    const searchResponse = await fetch(searchUrl);
    
    if (searchResponse.ok) {
      const versionData = await searchResponse.text();
      console.log('  ✓ スナップショットAPI利用可能');
      console.log('  - バージョン:', versionData.trim());
    } else {
      console.log('  ✗ スナップショットAPI応答なし');
    }
  } catch (error) {
    console.log('  ✗ エラー:', error.message);
  }

  // 4. 動画情報API（getthumbinfo）
  console.log('\n4. 動画情報API (getthumbinfo) のテスト:');
  try {
    // テスト用の動画ID（存在する可能性が高いID）
    const testVideoId = 'sm1';
    const thumbUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${testVideoId}`;
    
    const thumbResponse = await fetch(thumbUrl);
    if (thumbResponse.ok) {
      console.log('  ✓ getthumbinfo API利用可能');
      const xmlData = await thumbResponse.text();
      console.log('  - レスポンス形式: XML');
      console.log('  - データサイズ:', xmlData.length, 'bytes');
    } else {
      console.log('  ✗ getthumbinfo API応答なし');
    }
  } catch (error) {
    console.log('  ✗ エラー:', error.message);
  }

  // 5. 代替ランキングソース（rei-sore）の確認
  console.log('\n5. rei-sore.net（代替ランキングソース）のテスト:');
  try {
    const reiSoreUrl = 'https://www.rei-sore.net/ranking/other/hourly';
    const reiSoreResponse = await fetch(reiSoreUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    
    console.log('  - Status:', reiSoreResponse.status);
    if (reiSoreResponse.ok) {
      console.log('  ✓ rei-sore.net アクセス可能');
      const htmlContent = await reiSoreResponse.text();
      console.log('  - データサイズ:', htmlContent.length, 'bytes');
      
      // タイトルを確認
      const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        console.log('  - ページタイトル:', titleMatch[1]);
      }
    }
  } catch (error) {
    console.log('  ✗ エラー:', error.message);
  }
}

testNicoAPI().catch(console.error);