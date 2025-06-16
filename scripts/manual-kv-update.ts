#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import { execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  console.log('Manual KV Update Script');
  console.log('======================\n');
  
  // Check if credentials are set
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_KV_NAMESPACE_ID || !process.env.CLOUDFLARE_KV_API_TOKEN) {
    console.error('Error: Cloudflare credentials not set in environment variables');
    process.exit(1);
  }
  
  try {
    // Step 1: Run the GitHub Actions script to fetch data
    console.log('Step 1: Fetching latest ranking data from Nico Nico...');
    console.log('This will take about 2-3 minutes...\n');
    
    execSync('npx tsx scripts/update-ranking-github-action.ts', {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });
    
    console.log('\n✅ Data fetching completed successfully!');
    console.log('Check above for the number of items fetched.\n');
    
    // Step 2: Verify the data was written to KV
    console.log('Step 2: Verifying KV write...');
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN!;
    
    const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`;
    
    const response = await fetch(metadataUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (response.ok) {
      const metadata = await response.json();
      if (metadata.result && metadata.result.metadata) {
        const { updatedAt, totalItems, version } = metadata.result.metadata;
        console.log('\n✅ KV write verified!');
        console.log(`Updated at: ${new Date(updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST`);
        console.log(`Total items: ${totalItems}`);
        console.log(`Version: ${version}`);
      } else {
        console.log('\n⚠️  Warning: Could not verify KV metadata');
      }
    } else {
      console.error('\n❌ Error: Could not verify KV write');
      console.error(`Status: ${response.status}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();