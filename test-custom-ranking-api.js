// カスタムランキング作成のAPIレベルテスト

console.log('=== カスタムランキング404エラーテスト ===\n');

// 1. まず通常のランキングデータが取得できることを確認
const testNormalRanking = async () => {
  console.log('1. 通常のランキング（音楽）を取得...');
  try {
    const res = await fetch('http://localhost:3000/api/ranking?genre=music&period=24h');
    console.log(`   ステータス: ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      console.log(`   データ件数: ${json.items?.length || 0}`);
      console.log('   ✅ 正常に取得できました\n');
    } else {
      console.log('   ❌ エラーが発生しました\n');
    }
  } catch (error) {
    console.log('   ❌ ネットワークエラー:', error.message, '\n');
  }
};

// 2. カスタムランキング（存在しないID）でのテスト
const testCustomRanking = async () => {
  console.log('2. カスタムランキング（新規作成想定）を取得...');
  const customId = 'test-' + Date.now();
  try {
    const res = await fetch(`http://localhost:3000/api/ranking?genre=custom&tag=custom:${customId}&period=24h`);
    console.log(`   カスタムID: ${customId}`);
    console.log(`   ステータス: ${res.status}`);
    if (res.status === 404) {
      console.log('   ⚠️  404エラーが発生しました！');
      console.log('   これが新規作成時に表示される問題です\n');
    } else if (res.status === 200) {
      const json = await res.json();
      console.log(`   データ件数: ${json.items?.length || 0}`);
      console.log('   ✅ 正常に処理されました\n');
    }
  } catch (error) {
    console.log('   ❌ ネットワークエラー:', error.message, '\n');
  }
};

// 3. 音楽ジャンルのキャッシュ確認
const testMusicCache = async () => {
  console.log('3. 音楽ジャンルのキャッシュ状態を確認...');
  try {
    const res = await fetch('http://localhost:3000/api/ranking?genre=music&period=24h');
    console.log(`   ステータス: ${res.status}`);
    console.log(`   キャッシュヘッダー: ${res.headers.get('x-cache-status') || 'なし'}`);
    console.log('   ✅ 確認完了\n');
  } catch (error) {
    console.log('   ❌ ネットワークエラー:', error.message, '\n');
  }
};

// 実行
(async () => {
  await testNormalRanking();
  await testCustomRanking();
  await testMusicCache();
  
  console.log('=== テスト完了 ===');
  console.log('\n結論:');
  console.log('カスタムランキングのAPIエンドポイントが、');
  console.log('存在しないカスタムIDに対して404を返すのは正常な動作です。');
  console.log('\n問題は、新規作成直後にこのAPIが呼ばれて、');
  console.log('UIに404エラーが表示されることです。');
})();