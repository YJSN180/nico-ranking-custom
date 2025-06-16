#!/usr/bin/env npx tsx
import 'dotenv/config'

async function checkKV() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  console.log('環境変数の確認:');
  console.log('- CLOUDFLARE_ACCOUNT_ID:', CF_ACCOUNT_ID ? '設定済み' : '未設定');
  console.log('- CLOUDFLARE_KV_NAMESPACE_ID:', CF_NAMESPACE_ID ? '設定済み' : '未設定');
  console.log('- CLOUDFLARE_KV_API_TOKEN:', CF_API_TOKEN ? '設定済み' : '未設定');

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error('\n❌ Cloudflare KVの認証情報が設定されていません');
    return;
  }

  try {
    // KVからデータを取得
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;
    
    console.log('\nKVからデータを取得中...');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    });

    if (response.status === 404) {
      console.error('❌ RANKING_LATESTキーが存在しません');
      return;
    }

    if (!response.ok) {
      console.error(`❌ KV読み取りエラー: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('エラー詳細:', errorText);
      return;
    }

    const data = await response.arrayBuffer();
    const uint8Array = new Uint8Array(data);
    
    // gzip圧縮されているかチェック
    const isGzipped = uint8Array[0] === 0x1f && uint8Array[1] === 0x8b;
    console.log('\nデータ情報:');
    console.log('- サイズ:', data.byteLength, 'bytes');
    console.log('- 圧縮形式:', isGzipped ? 'gzip' : '非圧縮');

    if (isGzipped) {
      // pakoで解凍
      const pako = await import('pako');
      const jsonString = pako.ungzip(uint8Array, { to: 'string' });
      const rankingData = JSON.parse(jsonString);
      
      console.log('\n✅ KVデータが正常に取得できました');
      console.log('- ジャンル数:', Object.keys(rankingData.genres).length);
      console.log('- メタデータ:', rankingData.metadata);
      
      // いくつかのジャンルのアイテム数を表示
      console.log('\n各ジャンルのアイテム数:');
      for (const [genre, data] of Object.entries(rankingData.genres).slice(0, 5)) {
        const genreData = data as any;
        console.log(`  ${genre}:`);
        console.log(`    - 24h: ${genreData['24h'].items.length}件`);
        console.log(`    - hour: ${genreData.hour.items.length}件`);
      }
    } else {
      const jsonString = new TextDecoder().decode(uint8Array);
      const rankingData = JSON.parse(jsonString);
      console.log('\n✅ KVデータ（非圧縮）が取得できました');
      console.log('データ構造:', Object.keys(rankingData));
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
  }
}

checkKV();