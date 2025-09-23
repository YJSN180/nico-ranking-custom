const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || '312190a58a066f607a92a4eacf8ba0a8';

async function getCacheRules() {
  console.log('🔍 Cloudflare Cache Rules確認中...\n');
  console.log('Zone ID:', ZONE_ID);

  // Rulesets APIでキャッシュルールセットを取得
  const rulesetsResponse = await fetch(
    'https://api.cloudflare.com/client/v4/zones/' + ZONE_ID + '/rulesets',
    {
      headers: {
        'Authorization': 'Bearer ' + API_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const rulesetsData = await rulesetsResponse.json();

  if (!rulesetsData.success) {
    console.error('❌ Rulesets取得エラー:', rulesetsData.errors);
    return;
  }

  console.log('📋 利用可能なRulesets:');
  rulesetsData.result.forEach(ruleset => {
    console.log('  - ' + ruleset.name + ' (' + ruleset.phase + ') - ID: ' + ruleset.id);
  });

  // http_request_cache_settingsフェーズのルールセットを探す
  const cacheRuleset = rulesetsData.result.find(r =>
    r.phase === 'http_request_cache_settings'
  );

  if (!cacheRuleset) {
    console.log('\n⚠️ Cache Rulesのルールセットが見つかりません');
    return;
  }

  console.log('\n✅ Cache Ruleset発見: ' + cacheRuleset.name);
  console.log('   ID: ' + cacheRuleset.id);

  // 具体的なルールを取得
  const rulesResponse = await fetch(
    'https://api.cloudflare.com/client/v4/zones/' + ZONE_ID + '/rulesets/' + cacheRuleset.id,
    {
      headers: {
        'Authorization': 'Bearer ' + API_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const rulesData = await rulesResponse.json();

  if (!rulesData.success) {
    console.error('❌ Rules取得エラー:', rulesData.errors);
    return;
  }

  const rules = rulesData.result.rules || [];
  console.log('\n📊 Cache Rules数: ' + rules.length + '個\n');

  // 各ルールの詳細を表示
  let ruleIndex = 0;
  for (const rule of rules) {
    ruleIndex++;
    console.log('========== Cache Rule ' + ruleIndex + ' ==========');
    console.log('名前: ' + (rule.description || '(名称なし)'));
    console.log('ID: ' + rule.id);
    console.log('有効: ' + (rule.enabled ? '✅' : '❌'));

    // Expression (条件)
    if (rule.expression) {
      console.log('条件: ' + rule.expression);
    }

    // Action (アクション)
    if (rule.action_parameters) {
      const params = rule.action_parameters;
      console.log('\n📝 Cache設定:');

      if (params.cache !== undefined) {
        console.log('  キャッシュ有効: ' + params.cache);
      }

      if (params.edge_ttl) {
        const ttl = params.edge_ttl;
        console.log('  Edge TTL:');
        if (ttl.mode === 'override_origin') {
          console.log('    モード: キャッシュ制御ヘッダーを無視');
          console.log('    デフォルト値: ' + ttl.default + '秒 (' + (ttl.default/60) + '分)');

          if (ttl.status_code_ttl) {
            console.log('    ステータスコード別TTL:');
            ttl.status_code_ttl.forEach(sct => {
              console.log('      ' + sct.status_code + ': ' + sct.value + '秒 (' + (sct.value/60) + '分)');
            });
          }
        } else {
          console.log('    モード: ' + ttl.mode);
          if (ttl.default) {
            console.log('    値: ' + ttl.default + '秒');
          }
        }
      }

      if (params.browser_ttl) {
        const ttl = params.browser_ttl;
        console.log('  Browser TTL:');
        console.log('    モード: ' + ttl.mode);
        if (ttl.default !== undefined) {
          console.log('    値: ' + ttl.default + '秒 (' + (ttl.default/60) + '分)');
        }
      }

      if (params.cache_key) {
        console.log('  Cache Key設定あり');
      }

      if (params.respect_strong_etags !== undefined) {
        console.log('  強力なETags尊重: ' + params.respect_strong_etags);
      }

      if (params.origin_error_page_passthru !== undefined) {
        console.log('  オリジンエラーページパススルー: ' + params.origin_error_page_passthru);
      }
    }

    console.log('');
  }

  // 問題のあるルールを特定
  console.log('\n⚠️ 注意が必要なルール:');
  let problemIndex = 0;
  for (const rule of rules) {
    problemIndex++;
    const params = rule.action_parameters;
    if (params && params.edge_ttl && params.edge_ttl.mode === 'override_origin') {
      console.log('\n  Rule ' + problemIndex + ': ' + (rule.description || '(名称なし)'));
      console.log('    → キャッシュ制御ヘッダーを無視してTTL ' + params.edge_ttl.default + '秒を使用');

      // URLパターンを解析
      if (rule.expression) {
        if (rule.expression.includes('/api/')) {
          console.log('    🚨 APIエンドポイントに影響！');
        }
        if (rule.expression.includes('nico-rank.com')) {
          console.log('    🔔 nico-rank.comドメインに適用');
        }
      }
    }
  }

  return rulesData.result;
}

(async () => {
  await getCacheRules();
})();
