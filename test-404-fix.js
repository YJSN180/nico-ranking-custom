// カスタムランキング404エラー修正のテストスクリプト
// 開発サーバー起動後、ブラウザのコンソールで実行

console.log('=== カスタムランキング404エラー修正テスト ===\n');

// 修正内容の概要
console.log('📝 実装した修正内容:');
console.log('1. setNewlyCreatedRankingを先に実行するよう順序を変更');
console.log('2. use-ranking-data.tsにtargetRankingが見つからない場合の早期リターンを追加');
console.log('3. isCreatingCustomRankingフラグによる404エラー回避機能を追加');
console.log('4. デバッグログによる状態追跡機能を強化\n');

// テスト手順
console.log('🧪 テスト手順:');
console.log('1. カスタムタブをクリック');
console.log('2. 「＋ 新しく作成する」ボタンをクリック');
console.log('3. タイトル: テスト_' + Date.now());
console.log('4. ベースジャンル: 音楽');
console.log('5. タグ: 歌ってみた');
console.log('6. 保存ボタンをクリック\n');

// 期待される動作
console.log('✅ 期待される動作:');
console.log('- 画面に「エラー: HTTP 404:」が表示されないこと');
console.log('- 作成したカスタムランキングが正しく表示されること');
console.log('- コンソールに以下のログが順番に表示されること:');
console.log('  [DEBUG] Setting newlyCreatedRanking:');
console.log('  [DEBUG] isCreatingCustomRanking flag set to true');
console.log('  [DEBUG] Calling onConfigChange after creation:');
console.log('  [DEBUG] Skipping fetchRankingData during custom ranking creation');
console.log('  [DEBUG] Custom ranking immediate display activated:');
console.log('  [DEBUG] isCreatingCustomRanking flag cleared\n');

// エラー監視の開始
console.log('🔍 エラー監視を開始します...\n');

// 元のconsole.logを保存
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// デバッグログをハイライト
console.log = function(...args) {
  const message = args.join(' ');
  if (message.includes('[DEBUG]')) {
    originalLog.call(console, '✨', ...args);
  } else {
    originalLog.call(console, ...args);
  }
};

console.error = function(...args) {
  const message = args.join(' ');
  if (message.includes('404')) {
    originalError.call(console, '❌ 404エラー検出:', ...args);
  } else {
    originalError.call(console, ...args);
  }
};

console.warn = function(...args) {
  const message = args.join(' ');
  if (message.includes('Custom ranking not found')) {
    originalWarn.call(console, '⚠️  カスタムランキング未検出:', ...args);
  } else {
    originalWarn.call(console, ...args);
  }
};

// DOM監視による404エラー検出
let errorDetected = false;
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.textContent && node.textContent.includes('エラー: HTTP 404:')) {
        if (!errorDetected) {
          errorDetected = true;
          console.error('❌❌❌ 404エラーが画面に表示されました！修正が機能していません。');
          console.error('表示要素:', node);
        }
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

// タイマーで定期的にチェック
let checkCount = 0;
const checkInterval = setInterval(() => {
  checkCount++;
  
  // 404エラー要素を探す
  const errorElements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && el.textContent.includes('エラー: HTTP 404:')
  );
  
  if (errorElements.length > 0 && !errorDetected) {
    errorDetected = true;
    console.error('❌❌❌ 404エラーが検出されました！');
    errorElements.forEach(el => console.error('エラー要素:', el));
  }
  
  // 30秒後に監視終了
  if (checkCount >= 30) {
    clearInterval(checkInterval);
    if (!errorDetected) {
      console.log('\n✅ 30秒間404エラーは検出されませんでした！');
    }
  }
}, 1000);

console.log('監視を開始しました。カスタムランキングを作成してテストしてください。');