// ブラウザのコンソールで実行するスクリプト
// カスタムランキング作成の動作確認用

console.log('=== カスタムランキング作成テスト開始 ===');

// 1. カスタムタブをクリック
const customTab = document.querySelector('button[class*="genreButton"]:has-text("カスタム")') || 
                  Array.from(document.querySelectorAll('button')).find(btn => btn.textContent === 'カスタム');

if (customTab) {
  console.log('✅ カスタムタブが見つかりました');
  customTab.click();
  
  setTimeout(() => {
    // 2. 新規作成ボタンを探す
    const createButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('新しく作成する'));
    
    if (createButton) {
      console.log('✅ 新規作成ボタンが見つかりました');
      console.log('📝 手動で以下の操作を実行してください:');
      console.log('1. 「＋ 新しく作成する」ボタンをクリック');
      console.log('2. タイトル: テスト_' + Date.now());
      console.log('3. ベースジャンル: 音楽');
      console.log('4. タグ: 歌ってみた');
      console.log('5. 保存ボタンをクリック');
      console.log('\n⚠️  保存後、画面にエラーが表示されるか確認してください');
      console.log('🔍 コンソールログも確認してください');
      
      // デバッグログを監視
      const originalLog = console.log;
      console.log = function(...args) {
        const message = args.join(' ');
        if (message.includes('[DEBUG]') || message.includes('[ERROR]') || message.includes('[WARN]')) {
          originalLog.call(console, '🔍', ...args);
        } else {
          originalLog.call(console, ...args);
        }
      };
      
      // エラー要素を監視
      setInterval(() => {
        const errorElement = document.querySelector('*:has-text("エラー: HTTP 404:")') ||
                           Array.from(document.querySelectorAll('*')).find(el => 
                             el.textContent && el.textContent.includes('エラー: HTTP 404:'));
        if (errorElement) {
          console.error('❌ 404エラーが画面に表示されています！');
          console.error('要素:', errorElement);
        }
      }, 1000);
      
    } else {
      console.log('❌ 新規作成ボタンが見つかりません');
    }
  }, 1000);
  
} else {
  console.log('❌ カスタムタブが見つかりません');
  console.log('利用可能なボタン:', Array.from(document.querySelectorAll('button')).map(btn => btn.textContent));
}