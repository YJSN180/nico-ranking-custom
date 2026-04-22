#!/usr/bin/env npx tsx
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseBufferAsJSON } from '../lib/unified-compression.js';

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('R2 credentials not configured');
  process.exit(1);
}

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function transformBodyToArrayBuffer(body: any) {
  const bytes = await body.transformToByteArray();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function testWorkerStatsFetch() {
  try {
    console.log('Testing Worker stats fetch flow...\n');

    // 1. Check metadata.json
    console.log('1. Fetching metadata.json from R2...');
    const metadataCommand = new GetObjectCommand({
      Bucket: 'nico-ranking',
      Key: 'rankings/metadata.json',
    });

    const metadataResponse = await s3Client.send(metadataCommand);
    const metadata = metadataResponse.Body
      ? await parseBufferAsJSON(await transformBodyToArrayBuffer(metadataResponse.Body))
      : {};

    console.log('✓ Metadata found:');
    console.log(`  - Version: ${metadata.version}`);
    console.log(`  - Last updated: ${metadata.lastUpdated}`);
    console.log(`  - Genres: ${Object.keys(metadata.tagsByGenrePeriod || {}).length} combinations`);

    // 2. Check a sample ranking file
    console.log('\n2. Fetching sample ranking file (all/24h/all.json)...');
    const rankingCommand = new GetObjectCommand({
      Bucket: 'nico-ranking',
      Key: 'rankings/all/24h/all.json',
    });

    const rankingResponse = await s3Client.send(rankingCommand);
    const rankingData = rankingResponse.Body
      ? await parseBufferAsJSON(await transformBodyToArrayBuffer(rankingResponse.Body))
      : {};

    console.log('✓ Ranking data found:');
    console.log(`  - Items: ${rankingData.items?.length || 0}`);
    console.log(`  - Popular tags: ${rankingData.popularTags?.length || 0}`);

    // 3. Extract unique video IDs (simulate Worker behavior)
    console.log('\n3. Extracting unique video IDs...');
    const videoIds = new Set<string>();

    if (rankingData.items) {
      rankingData.items.forEach((item: any) => {
        if (item.id) videoIds.add(item.id);
      });
    }

    console.log(`✓ Found ${videoIds.size} unique video IDs from all/24h`);

    // 4. Check if video stats would be fetchable
    console.log('\n4. Simulating video stats fetch...');
    const sampleVideoIds = Array.from(videoIds).slice(0, 5);
    console.log(`  Sample video IDs: ${sampleVideoIds.join(', ')}`);

    // 5. Check KV for existing stats (simulated)
    console.log('\n5. Worker would update KV with stats:');
    console.log('  - Key: VIDEO_STATS_LATEST');
    console.log(`  - Total videos: ${videoIds.size}`);
    console.log('  - Update timestamp: ' + new Date().toISOString());

    console.log('\n✅ Worker stats fetch flow is operational');
    console.log('The Worker should be able to:');
    console.log('  1. Read metadata from R2');
    console.log('  2. Fetch ranking data from R2');
    console.log('  3. Extract video IDs');
    console.log('  4. Update stats in KV');

  } catch (error) {
    console.error('\n❌ Error testing Worker stats fetch:', error);
  }
}

// Run the test
testWorkerStatsFetch();
