import * as https from 'https';

// 本番環境のURLを設定（デプロイ後に更新してください）
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://nico-ranking.pages.dev';

async function testProduction() {
  console.log(`Testing production environment: ${PRODUCTION_URL}\n`);
  
  const tests = [
    {
      name: 'Homepage',
      path: '/',
      checks: [
        (res: any, data: string) => res.statusCode === 200,
        (res: any, data: string) => res.headers['content-type']?.includes('text/html'),
        (res: any, data: string) => data.includes('ニコニコ動画ランキング'),
      ]
    },
    {
      name: 'Snapshot API',
      path: '/api/snapshot',
      checks: [
        (res: any, data: string) => res.statusCode === 200,
        (res: any, data: string) => res.headers['content-type']?.includes('application/json'),
        (res: any, data: string) => {
          try {
            const json = JSON.parse(data);
            return json.timestamp && json.version && json.genres;
          } catch {
            return false;
          }
        }
      ]
    },
    {
      name: 'Ranking API - All/24h',
      path: '/api/ranking?genre=all&period=24h',
      checks: [
        (res: any, data: string) => res.statusCode === 200,
        (res: any, data: string) => {
          try {
            const json = JSON.parse(data);
            return Array.isArray(json.items) && json.items.length > 0;
          } catch {
            return false;
          }
        }
      ]
    },
    {
      name: 'Ranking API - Game/Hour',
      path: '/api/ranking?genre=game&period=hour',
      checks: [
        (res: any, data: string) => res.statusCode === 200,
        (res: any, data: string) => {
          try {
            const json = JSON.parse(data);
            return Array.isArray(json.items);
          } catch {
            return false;
          }
        }
      ]
    },
    {
      name: 'Ranking API - Tag Filter',
      path: '/api/ranking?genre=all&period=24h&tag=ゲーム',
      checks: [
        (res: any, data: string) => res.statusCode === 200,
        (res: any, data: string) => {
          try {
            const json = JSON.parse(data);
            return 'items' in json && 'hasMore' in json && 'totalItems' in json;
          } catch {
            return false;
          }
        }
      ]
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`Testing ${test.name}...`);
    
    const url = new URL(test.path, PRODUCTION_URL);
    
    try {
      const result = await new Promise<{ res: any, data: string }>((resolve, reject) => {
        https.get(url.toString(), (res) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => resolve({ res, data }));
        }).on('error', reject);
      });
      
      let allPassed = true;
      for (let i = 0; i < test.checks.length; i++) {
        const checkPassed = test.checks[i](result.res, result.data);
        if (!checkPassed) {
          console.log(`  ✗ Check ${i + 1} failed`);
          allPassed = false;
        }
      }
      
      if (allPassed) {
        console.log(`  ✓ All checks passed`);
        passed++;
      } else {
        console.log(`  ✗ Some checks failed`);
        console.log(`    Status: ${result.res.statusCode}`);
        console.log(`    Headers: ${JSON.stringify(result.res.headers)}`);
        console.log(`    Body (first 200 chars): ${result.data.substring(0, 200)}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ Request failed: ${error}`);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('Summary:');
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total: ${tests.length}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Check if production URL is provided
if (!process.env.PRODUCTION_URL && PRODUCTION_URL === 'https://nico-ranking.pages.dev') {
  console.log('Note: Using default production URL. After deployment, run with:');
  console.log('  PRODUCTION_URL=https://your-app.pages.dev npx tsx scripts/test-production.ts');
  console.log('');
}

testProduction();