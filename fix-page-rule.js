const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = '312190a58a066f607a92a4eacf8ba0a8';
const RULE_ID = 'cb234d8068164afddeb5fea2fd8e6ccb';

async function updatePageRule() {
  const updatedRule = {
    targets: [
      {
        target: "url",
        constraint: {
          operator: "matches",
          value: "*nico-rank.com/api/*"
        }
      }
    ],
    actions: [
      {
        id: "browser_cache_ttl",
        value: 1800  // 30分
      },
      {
        id: "cache_level",
        value: "aggressive"
      },
      {
        id: "explicit_cache_control",
        value: "on"  // キャッシュ制御ヘッダーを無視（ただしTTLは30分）
      }
    ],
    priority: 2,
    status: "active"
  };

  console.log('🔧 Page Rule更新中...');
  console.log('  URL: *nico-rank.com/api/*');
  console.log('  変更内容:');
  console.log('    browser_cache_ttl: 31日 → 30分');
  console.log('    explicit_cache_control: ON（維持）');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/pagerules/${RULE_ID}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedRule)
    }
  );

  const data = await response.json();
  
  if (data.success) {
    console.log('\n✅ 更新成功！');
    console.log('新しい設定:');
    data.result.actions.forEach(action => {
      if (action.id === 'browser_cache_ttl') {
        console.log(`  ${action.id}: ${action.value}秒 (${action.value/60}分)`);
      }
      if (action.id === 'explicit_cache_control') {
        console.log(`  ${action.id}: ${action.value}`);
      }
    });
  } else {
    console.log('\n❌ 更新失敗:', data.errors);
  }
}

updatePageRule();
