#!/usr/bin/env node

/**
 * DNS伝播状況の確認
 */

async function checkDNSPropagation() {
  const domains = ['nico-rank.com', 'www.nico-rank.com'];
  
  console.log('🌍 DNS伝播チェック中...\n');
  console.log('設定直後の場合、反映には以下の時間がかかります:');
  console.log('- Cloudflare内部: 即座〜5分');
  console.log('- グローバル: 5分〜48時間\n');
  
  for (const domain of domains) {
    console.log(`\n📡 ${domain} の確認:`);
    
    // 1. HTTPSアクセステスト（Cloudflare経由）
    try {
      console.log('  HTTPSアクセステスト...');
      const response = await fetch(`https://${domain}`, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });
      
      console.log(`  ✅ ステータス: ${response.status}`);
      
      // Cloudflareのヘッダーを確認
      const cfRay = response.headers.get('cf-ray');
      if (cfRay) {
        console.log(`  ✅ Cloudflare経由でアクセス (CF-Ray: ${cfRay})`);
      }
      
      // サーバーヘッダーを確認
      const server = response.headers.get('server');
      console.log(`  サーバー: ${server || 'unknown'}`);
      
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.log('  ❌ DNS解決できません（まだ伝播していません）');
      } else if (error.name === 'AbortError') {
        console.log('  ⏱️  タイムアウト（DNS解決中の可能性）');
      } else {
        console.log(`  ❌ エラー: ${error.message}`);
      }
    }
    
    // 2. ブラウザでのアクセス方法
    console.log(`\n  🌐 ブラウザでテスト: https://${domain}`);
  }
  
  // 3. Workers URLの動作確認（比較用）
  console.log('\n\n📊 Cloudflare Workers（すでに動作中）:');
  try {
    const response = await fetch('https://nico-ranking-api-gateway.yjsn180180.workers.dev', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    console.log(`✅ Workers URL: ステータス ${response.status}`);
    console.log('   これと同じ内容が nico-rank.com でも表示されるはずです');
  } catch (error) {
    console.log('❌ Workers URLエラー');
  }
  
  // 4. 推奨事項
  console.log('\n\n💡 次のステップ:');
  console.log('1. 5〜10分待ってから再度このスクリプトを実行');
  console.log('2. ブラウザのシークレットモードで https://nico-rank.com にアクセス');
  console.log('3. もし表示されない場合:');
  console.log('   - Cloudflareダッシュボードで DNS → Records を確認');
  console.log('   - オレンジ色の雲（Proxy）がONになっているか確認');
  console.log('   - Workers routesが正しく設定されているか確認');
  
  // 5. Vercel直接アクセスの制限確認
  console.log('\n\n🔒 セキュリティチェック:');
  try {
    const response = await fetch('https://nico-ranking-custom-yjsns-projects.vercel.app', {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.status === 301 || response.status === 302) {
      console.log('✅ Vercel直接アクセスは制限されています');
      console.log(`   リダイレクト先: ${response.headers.get('location')}`);
    } else {
      console.log('⚠️  Vercel直接アクセスがまだ可能です');
      console.log('   環境変数 WORKER_AUTH_KEY の設定を確認してください');
    }
  } catch (error) {
    console.log('Vercelアクセスチェックエラー:', error);
  }
}

// 実行
checkDNSPropagation().catch(console.error);