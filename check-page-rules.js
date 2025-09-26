const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function getZoneId() {
  const response = await fetch('https://api.cloudflare.com/client/v4/zones?name=nico-rank.com', {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return data.result?.[0]?.id;
}

async function getPageRules(zoneId) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/pagerules`, {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return data.result;
}

(async () => {
  const zoneId = await getZoneId();
  if (!zoneId) {
    console.error('Zone ID not found');
    return;
  }
  console.log('Zone ID:', zoneId);
  
  const pageRules = await getPageRules(zoneId);
  console.log('\nPage Rules:');
  pageRules?.forEach(rule => {
    console.log(`- ${rule.targets[0]?.constraint?.value}`);
    rule.actions?.forEach(action => {
      if (action.id === 'cache_level' || action.id === 'edge_cache_ttl' || action.id === 'browser_cache_ttl') {
        console.log(`  ${action.id}: ${action.value}`);
      }
    });
  });
})();
