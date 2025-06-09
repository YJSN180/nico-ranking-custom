import * as https from 'https';
import { ungzip } from 'pako';

// Cloudflare Pagesのデプロイ後URLを環境変数から取得
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://nico-ranking.pages.dev';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

async function fetchUrl(url: string): Promise<{ status: number; headers: any; data: string }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        data
      }));
    }).on('error', reject);
  });
}

async function verifyCloudflareDeployment() {
  console.log(`🚀 Verifying Cloudflare Pages deployment at: ${PRODUCTION_URL}\n`);

  const results: TestResult[] = [];

  // Test 1: Homepage loads
  console.log('📋 Test 1: Homepage accessibility...');
  try {
    const homepage = await fetchUrl(`${PRODUCTION_URL}/`);
    const homepageOk = homepage.status === 200 && 
                       homepage.data.includes('ニコニコ動画ランキング') &&
                       homepage.data.includes('_next');
    results.push({
      name: 'Homepage Load',
      passed: homepageOk,
      details: homepageOk ? 'Homepage loads correctly with Next.js assets' : `Status: ${homepage.status}`
    });
  } catch (error) {
    results.push({
      name: 'Homepage Load',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 2: API Routes work
  console.log('📋 Test 2: API routes functionality...');
  try {
    const apiTest = await fetchUrl(`${PRODUCTION_URL}/api/ranking?genre=all&period=24h&limit=10`);
    const apiOk = apiTest.status === 200 && apiTest.headers['content-type']?.includes('application/json');
    
    if (apiOk) {
      const data = JSON.parse(apiTest.data);
      const hasData = data.items && Array.isArray(data.items) && data.items.length > 0;
      results.push({
        name: 'API Routes',
        passed: hasData,
        details: hasData ? `API returns ${data.items.length} items` : 'API returns empty data'
      });
    } else {
      results.push({
        name: 'API Routes',
        passed: false,
        details: `API status: ${apiTest.status}`
      });
    }
  } catch (error) {
    results.push({
      name: 'API Routes',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 3: Snapshot API
  console.log('📋 Test 3: Snapshot API...');
  try {
    const snapshot = await fetchUrl(`${PRODUCTION_URL}/api/snapshot`);
    const snapshotOk = snapshot.status === 200;
    
    if (snapshotOk) {
      const data = JSON.parse(snapshot.data);
      const hasValidData = data.timestamp && data.version && data.genres;
      const genreCount = Object.keys(data.genres || {}).length;
      results.push({
        name: 'Snapshot API',
        passed: hasValidData && genreCount > 0,
        details: hasValidData ? `Snapshot contains ${genreCount} genres` : 'Invalid snapshot structure'
      });
    } else {
      results.push({
        name: 'Snapshot API',
        passed: false,
        details: `Status: ${snapshot.status}`
      });
    }
  } catch (error) {
    results.push({
      name: 'Snapshot API',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 4: Static assets
  console.log('📋 Test 4: Static assets...');
  try {
    const homepage = await fetchUrl(`${PRODUCTION_URL}/`);
    const hasNextAssets = homepage.data.includes('/_next/static/');
    results.push({
      name: 'Static Assets',
      passed: hasNextAssets,
      details: hasNextAssets ? 'Next.js static assets are properly served' : 'Static assets not found'
    });
  } catch (error) {
    results.push({
      name: 'Static Assets',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 5: Edge Runtime performance
  console.log('📋 Test 5: Edge Runtime performance...');
  try {
    const start = Date.now();
    await fetchUrl(`${PRODUCTION_URL}/api/ranking?genre=game&period=hour`);
    const duration = Date.now() - start;
    const fast = duration < 1000; // Should respond within 1 second
    results.push({
      name: 'Edge Performance',
      passed: fast,
      details: `Response time: ${duration}ms ${fast ? '(Good)' : '(Slow)'}`
    });
  } catch (error) {
    results.push({
      name: 'Edge Performance',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Print results
  console.log('\n📊 Deployment Verification Results:\n');
  let passed = 0;
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.details}`);
    if (result.passed) passed++;
  });

  console.log(`\n🎯 Summary: ${passed}/${results.length} tests passed`);

  if (passed === results.length) {
    console.log('\n🎉 Cloudflare Pages deployment is fully functional!');
    
    // Show important URLs
    console.log('\n📌 Important URLs:');
    console.log(`   - Production: ${PRODUCTION_URL}`);
    console.log(`   - Convex Dashboard: https://dashboard.convex.dev/d/judicious-lemming-629`);
    console.log(`   - Cloudflare Dashboard: https://dash.cloudflare.com/`);
    
    console.log('\n💡 Next steps:');
    console.log('   1. Monitor the Convex cron job in the dashboard');
    console.log('   2. Check Cloudflare Analytics for performance metrics');
    console.log('   3. Verify data freshness with: npm run check:kv');
    
  } else {
    console.log('\n⚠️  Some tests failed. Please check the deployment configuration.');
    process.exit(1);
  }
}

// メイン実行
if (!process.env.PRODUCTION_URL) {
  console.log('ℹ️  No PRODUCTION_URL provided. Using default: https://nico-ranking.pages.dev');
  console.log('   After deployment, run with your actual URL:');
  console.log('   PRODUCTION_URL=https://your-app.pages.dev npx tsx scripts/verify-cloudflare-deployment.ts\n');
}

verifyCloudflareDeployment().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});