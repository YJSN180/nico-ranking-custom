const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = '312190a58a066f607a92a4eacf8ba0a8';

async function getPageRuleDetail() {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/pagerules?status=active`, {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  
  const apiRule = data.result.find(r => 
    r.targets?.[0]?.constraint?.value?.includes('/api/*')
  );
  
  if (apiRule) {
    console.log('API Page Rule詳細:');
    console.log(JSON.stringify(apiRule, null, 2));
  }
  return apiRule;
}

getPageRuleDetail();
