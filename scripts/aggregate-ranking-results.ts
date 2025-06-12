#!/usr/bin/env npx tsx
import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'

// Write to Cloudflare KV via REST API with retry logic
async function writeToCloudflareKV(data: any): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  // Dynamic import for pako
  const pako = await import('pako');
  const jsonString = JSON.stringify(data);
  const compressed = pako.gzip(jsonString);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;

  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: compressed,
      });

      if (response.status === 429) {
        // Rate limited, wait with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`KV rate limited, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }
      
      // Success, break out of retry loop
      break;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries - 1) {
        throw error;
      }
      // Retry on other errors too
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`KV write failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Set metadata
  const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`;
  
  await fetch(metadataUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      compressed: true,
      version: 1,
      updatedAt: new Date().toISOString(),
      size: compressed.length,
      ngFiltered: true,
    }),
  });
}

async function main() {
  try {
    console.log('Aggregating ranking results from all groups...');
    
    // Read all partial results
    const tmpDir = './tmp';
    let files: string[] = [];
    try {
      files = await fs.readdir(tmpDir);
    } catch (error) {
      console.error('Failed to read tmp directory:', error);
      process.exit(1);
    }
    
    const groupFiles = files.filter(f => f.startsWith('ranking-group-') && f.endsWith('.json'));
    
    if (groupFiles.length === 0) {
      console.error('No group result files found in tmp directory');
      console.error('Available files:', files);
      process.exit(1);
    }
    
    console.log(`Found ${groupFiles.length} group result files`);
    
    // Build final data structure - EXACTLY THE SAME AS ORIGINAL
    const rankingData: any = {
      genres: {},
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalItems: 0,
        ngFiltered: true
      }
    };
    
    let totalItemsCount = 0;
    
    // Read and merge all group results
    for (const file of groupFiles) {
      const content = await fs.readFile(path.join(tmpDir, file), 'utf-8');
      const results = JSON.parse(content);
      
      for (const result of results) {
        // New structure: result.data contains both '24h' and 'hour'
        rankingData.genres[result.genre] = result.data;
        
        // Count items - EXACTLY THE SAME AS ORIGINAL
        totalItemsCount += result.data['24h'].items.length;
        totalItemsCount += result.data['hour'].items.length;
        
        for (const tagItems of Object.values(result.data['24h'].tags)) {
          totalItemsCount += (tagItems as any[]).length;
        }
        for (const tagItems of Object.values(result.data['hour'].tags)) {
          totalItemsCount += (tagItems as any[]).length;
        }
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;
    
    // Verify all genres are present
    const genreCount = Object.keys(rankingData.genres).length;
    console.log(`Aggregated ${genreCount} genres with ${totalItemsCount} total items`);
    
    if (genreCount !== 23) {
      console.warn(`Warning: Expected 23 genres but found ${genreCount}`);
    }

    // Write to Cloudflare KV - EXACTLY THE SAME AS ORIGINAL
    console.log('Writing aggregated data to Cloudflare KV...');
    await writeToCloudflareKV(rankingData);
    
    // Clean up temp files
    console.log('Cleaning up temporary files...');
    for (const file of groupFiles) {
      await fs.unlink(path.join(tmpDir, file));
    }
    
    console.log('Aggregation and KV write completed successfully!');
  } catch (error) {
    console.error('Aggregation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}