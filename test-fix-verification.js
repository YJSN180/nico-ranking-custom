// 修正内容の検証スクリプト
// Node.jsで実行: node test-fix-verification.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== カスタムランキング404エラー修正の検証 ===\n');

// 修正箇所の確認
const checkFixes = () => {
  console.log('📋 修正箇所の確認:\n');
  
  // 1. client-page.tsxの修正確認
  const clientPagePath = path.join(__dirname, 'app/client-page.tsx');
  const clientPageContent = fs.readFileSync(clientPagePath, 'utf8');
  
  // isCreatingCustomRankingフラグの定義
  if (clientPageContent.includes('const [isCreatingCustomRanking, setIsCreatingCustomRanking] = useState(false)')) {
    console.log('✅ isCreatingCustomRankingフラグが定義されています');
  } else {
    console.log('❌ isCreatingCustomRankingフラグが見つかりません');
  }
  
  // fetchRankingDataスキップ処理
  if (clientPageContent.includes('if (isCreatingCustomRanking && newConfig.genre === \'custom\')')) {
    console.log('✅ fetchRankingDataスキップ処理が実装されています');
  } else {
    console.log('❌ fetchRankingDataスキップ処理が見つかりません');
  }
  
  // フラグ設定処理
  if (clientPageContent.includes('setIsCreatingCustomRanking(true)')) {
    console.log('✅ 作成時のフラグ設定処理が実装されています');
  } else {
    console.log('❌ 作成時のフラグ設定処理が見つかりません');
  }
  
  // フラグクリア処理
  if (clientPageContent.includes('setIsCreatingCustomRanking(false)')) {
    console.log('✅ フラグクリア処理が実装されています');
  } else {
    console.log('❌ フラグクリア処理が見つかりません');
  }
  
  // 2. use-ranking-data.tsの修正確認
  console.log('\n');
  const hookPath = path.join(__dirname, 'hooks/use-ranking-data.ts');
  const hookContent = fs.readFileSync(hookPath, 'utf8');
  
  // targetRanking未検出時の早期リターン
  if (hookContent.includes('Custom ranking not found, returning empty data to prevent 404')) {
    console.log('✅ カスタムランキング未検出時の早期リターンが実装されています');
  } else {
    console.log('❌ カスタムランキング未検出時の早期リターンが見つかりません');
  }
  
  // 3. デバッグログの確認
  console.log('\n');
  const debugLogs = [
    'Setting newlyCreatedRanking:',
    'isCreatingCustomRanking flag set to true',
    'Skipping fetchRankingData during custom ranking creation',
    'isCreatingCustomRanking flag cleared',
    'Custom ranking not found, returning empty data to prevent 404'
  ];
  
  console.log('📝 実装されているデバッグログ:');
  debugLogs.forEach(log => {
    if (clientPageContent.includes(log) || hookContent.includes(log)) {
      console.log(`  ✅ "${log}"`);
    } else {
      console.log(`  ❌ "${log}"`);
    }
  });
};

// 修正の理論的な動作フロー
const explainFlow = () => {
  console.log('\n\n🔄 修正後の動作フロー:\n');
  console.log('1. カスタムランキング作成ボタンクリック');
  console.log('   ↓');
  console.log('2. handleCreateCustomRankingWithFilter実行');
  console.log('   - setNewlyCreatedRanking(新しいランキング情報)');
  console.log('   - setIsCreatingCustomRanking(true) ← 404防止フラグON');
  console.log('   ↓');
  console.log('3. onConfigChange呼び出し');
  console.log('   ↓');
  console.log('4. handleConfigChange実行');
  console.log('   - isCreatingCustomRankingをチェック');
  console.log('   - trueの場合、fetchRankingDataをスキップ ← 404エラーを回避！');
  console.log('   ↓');
  console.log('5. カスタムランキングのフィルタリング処理');
  console.log('   - キャッシュデータに対してフィルタリング適用');
  console.log('   - 結果を表示');
  console.log('   ↓');
  console.log('6. finally節でsetIsCreatingCustomRanking(false)');
  console.log('   ↓');
  console.log('7. 正常にカスタムランキングが表示される');
};

// テスト方法の説明
const testInstructions = () => {
  console.log('\n\n🧪 テスト方法:\n');
  console.log('1. 開発サーバーを起動');
  console.log('   npm run dev\n');
  console.log('2. ブラウザで http://localhost:3000 を開く\n');
  console.log('3. ブラウザの開発者ツール（F12）を開く\n');
  console.log('4. コンソールタブで test-404-fix.js の内容を貼り付けて実行\n');
  console.log('5. 画面でカスタムランキングを作成\n');
  console.log('6. 以下を確認:');
  console.log('   - 画面に404エラーが表示されないこと');
  console.log('   - コンソールにデバッグログが正しい順序で表示されること');
  console.log('   - 作成したカスタムランキングが正常に表示されること');
};

// 実行
checkFixes();
explainFlow();
testInstructions();

console.log('\n\n✅ 検証スクリプト完了');