import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseBufferAsJSON } from '../lib/unified-compression.js';

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing required environment variables:');
  console.error('- CLOUDFLARE_ACCOUNT_ID:', !!R2_ACCOUNT_ID);
  console.error('- R2_ACCESS_KEY_ID:', !!R2_ACCESS_KEY_ID);
  console.error('- R2_SECRET_ACCESS_KEY:', !!R2_SECRET_ACCESS_KEY);
  process.exit(1);
}

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

async function checkR2Data() {
  try {
    console.log('🔍 Checking R2 bucket structure...\n');

    // List objects in the bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: 'nico-ranking',
      Prefix: 'rankings/',
      MaxKeys: 50,
    });

    const listResponse = await s3Client.send(listCommand);

    console.log(`📁 Found ${listResponse.KeyCount} objects in rankings/ folder:`);

    if (listResponse.Contents) {
      for (const obj of listResponse.Contents) {
        console.log(`  - ${obj.Key} (${obj.Size} bytes, modified: ${obj.LastModified})`);
      }
    }

    // Check metadata.json
    console.log('\n📋 Checking metadata.json...');
    try {
      const metadataCommand = new GetObjectCommand({
        Bucket: 'nico-ranking',
        Key: 'rankings/metadata.json',
      });

      const metadataResponse = await s3Client.send(metadataCommand);
      const metadata = metadataResponse.Body
        ? await parseBufferAsJSON(await transformBodyToArrayBuffer(metadataResponse.Body))
        : null;

      if (metadata) {
        console.log('✅ metadata.json found:');
        console.log(`  - Genres: ${metadata.genres?.join(', ') || 'N/A'}`);
        console.log(`  - Periods: ${metadata.periods?.join(', ') || 'N/A'}`);
        console.log(`  - Updated: ${metadata.updatedAt || 'N/A'}`);
      }
    } catch (error) {
      console.log('❌ metadata.json not found');
    }

    // Check a sample ranking file
    console.log('\n📊 Checking sample ranking file...');
    try {
      const sampleCommand = new GetObjectCommand({
        Bucket: 'nico-ranking',
        Key: 'rankings/all/hour/all.json',
      });

      const sampleResponse = await s3Client.send(sampleCommand);
      const sampleData = sampleResponse.Body
        ? await parseBufferAsJSON(await transformBodyToArrayBuffer(sampleResponse.Body))
        : null;

      if (sampleData) {
        console.log('✅ Sample ranking file found:');
        console.log(`  - Videos: ${sampleData.items?.length || 0}`);
        console.log(`  - First video ID: ${sampleData.items?.[0]?.contentId || 'N/A'}`);
      }
    } catch (error) {
      console.log('❌ Sample ranking file not found');
    }

  } catch (error) {
    console.error('❌ Error checking R2 data:', error);
  }
}

checkR2Data();
