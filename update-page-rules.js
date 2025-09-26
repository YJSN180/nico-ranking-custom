const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = '312190a58a066f607a92a4eacf8ba0a8';

async function getPageRules() {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/pagerules?status=active`, {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return data.result;
}

async function updateApiPageRule(ruleId, currentRule) {
  // APIルールのTTLを30分(1800秒)に変更
  const updatedActions = currentRule.actions.map(action => {
    if (action.id === 'browser_cache_ttl') {
      return { ...action, value: 1800 }; // 30分
    }
    if (action.id === 'edge_cache_ttl') {
      return { id: 'edge_cache_ttl', value: 1800 }; // 30分追加
    }
    return action;
  });
  
  // edge_cache_ttlが含まれていない場合は追加
  const hasEdgeCacheTTL = updatedActions.some(a => a.id === 'edge_cache_ttl');
  if (!hasEdgeCacheTTL) {
    updatedActions.push({ id: 'edge_cache_ttl', value: 1800 });
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/pagerules/${ruleId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targets: currentRule.targets,
      actions: updatedActions,
      priority: currentRule.priority,
      status: currentRule.status
    })
  });
  
  const data = await response.json();
  return data;
}

(async () => {
  console.log('🔍 Page Rules確認中...\n');
  const pageRules = await getPageRules();
  
  for (const rule of pageRules) {
    const target = rule.targets[0]?.constraint?.value;
    if (target && target.includes('/api/*')) {
      console.log(`📝 APIルール発見: ${target}`);
      console.log('  現在のTTL設定:');
      rule.actions?.forEach(action => {
        if (action.id === 'browser_cache_ttl' || action.id === 'edge_cache_ttl') {
          console.log(`    ${action.id}: ${action.value}秒 (${action.value/3600}時間)`);
        }
      });
      
      console.log('\n🔧 TTLを30分に更新中...');
      const result = await updateApiPageRule(rule.id, rule);
      if (result.success) {
        console.log('✅ 更新成功!');
        console.log('  新しいTTL設定:');
        result.result.actions?.forEach(action => {
          if (action.id === 'browser_cache_ttl' || action.id === 'edge_cache_ttl') {
            console.log(`    ${action.id}: ${action.value}秒 (${action.value/60}分)`);
          }
        });
      } else {
        console.log('❌ 更新失敗:', result.errors);
      }
    }
  }
  
  console.log('\n✨ Page Rules更新完了');
})();
