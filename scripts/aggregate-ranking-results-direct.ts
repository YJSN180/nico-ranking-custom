#!/usr/bin/env npx tsx
import 'dotenv/config'
import * as fs from 'fs/promises'
import * as path from 'path'

// Write to Cloudflare KV directly (no temp keys)
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

  console.log(`Compressed data size: ${(compressed.length / 1024).toFixed(2)} KB`);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;
  
  const maxRetries = 5;
  
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
        if (attempt === maxRetries - 1) {
          throw new Error(`KV write failed: Rate limited (429) after ${maxRetries} attempts`);
        }
        
        const baseDelay = 15000; // 15 seconds initial delay
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitteredDelay = exponentialDelay + Math.random() * 10000;
        const delay = Math.min(jitteredDelay, 120000); // Max 120s
        
        console.log(`Rate limited, waiting ${Math.round(delay/1000)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }
      
      console.log('✅ Successfully wrote to RANKING_LATEST');
      
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
          updatedAt: data.metadata?.updatedAt || new Date().toISOString(),
          totalItems: data.metadata?.totalItems || 0,
          ngFiltered: true,
        }),
      });
      
      return; // Success
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.min(5000 * Math.pow(2, attempt), 30000);
      console.log(`Write failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
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
    
    // Build final data structure
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
      console.log(`Processing ${file}...`);
      const content = await fs.readFile(path.join(tmpDir, file), 'utf-8');
      
      let results;
      try {
        results = JSON.parse(content);
      } catch (error) {
        console.error(`Failed to parse JSON from ${file}:`, error);
        continue;
      }
      
      if (!Array.isArray(results)) {
        console.error(`Expected array in ${file}, got:`, typeof results);
        continue;
      }
      
      for (const result of results) {
        if (!result || !result.genre || !result.data) {
          console.error(`Invalid result structure in ${file}:`, result);
          continue;
        }
        
        rankingData.genres[result.genre] = result.data;
        
        // Count items
        totalItemsCount += result.data['24h'].items.length;
        totalItemsCount += result.data['hour'].items.length;
        
        // タグランキングも含める
        if (result.data['24h'].tags) {
          for (const tagItems of Object.values(result.data['24h'].tags)) {
            totalItemsCount += (tagItems as any[]).length;
          }
        }
        if (result.data['hour'].tags) {
          for (const tagItems of Object.values(result.data['hour'].tags)) {
            totalItemsCount += (tagItems as any[]).length;
          }
        }
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;
    
    const genreCount = Object.keys(rankingData.genres).length;
    console.log(`\nAggregated ${genreCount} genres with ${totalItemsCount} total items`);
    
    if (genreCount === 0) {
      console.error('No data to write!');
      process.exit(1);
    }

    // Save aggregated data locally as backup
    const backupPath = path.join(process.cwd(), 'tmp', 'latest-aggregated-data.json');
    await fs.writeFile(backupPath, JSON.stringify(rankingData, null, 2));
    console.log(`\nSaved aggregated data to ${backupPath}`);

    // Write to Cloudflare KV directly
    console.log('\nWriting aggregated data to Cloudflare KV...');
    await writeToCloudflareKV(rankingData);
    
    // Clean up temp files
    console.log('\nCleaning up temporary files...');
    for (const file of groupFiles) {
      await fs.unlink(path.join(tmpDir, file));
    }
    
    console.log('\nAggregation and KV write completed successfully!');
  } catch (error) {
    console.error('Aggregation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}