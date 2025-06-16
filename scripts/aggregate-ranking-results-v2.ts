#!/usr/bin/env npx tsx
import 'dotenv/config'
import * as fs from 'fs/promises'
import * as path from 'path'

// Write to Cloudflare KV via REST API with improved retry logic
async function writeToCloudflareKV(data: any): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  // Use timestamped key to avoid conflicts
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempKey = `RANKING_TEMP_${timestamp}`;
  
  console.log(`Writing to temporary key: ${tempKey}`);

  // Dynamic import for pako
  const pako = await import('pako');
  const jsonString = JSON.stringify(data);
  const compressed = pako.gzip(jsonString);
  
  console.log(`Compressed data size: ${Math.round(compressed.length / 1024)}KB`);

  // Step 1: Write to temporary key (less likely to conflict)
  const tempUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${tempKey}`;

  const maxRetries = 5;
  let writeSuccessful = false;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(tempUrl, {
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
        
        // Use shorter initial delay for temp key
        const baseDelay = 5000; // 5 seconds for temp key
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitteredDelay = exponentialDelay + Math.random() * 5000;
        const delay = Math.min(jitteredDelay, 60000); // Max 60s
        
        console.log(`Rate limited on temp key, waiting ${Math.round(delay/1000)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }
      
      writeSuccessful = true;
      break;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
      console.log(`Write failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  if (!writeSuccessful) {
    throw new Error('Failed to write to temporary key after all attempts');
  }

  console.log(`Successfully wrote to temporary key: ${tempKey}`);
  
  // Step 2: Wait a bit to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 3: Copy from temp key to RANKING_LATEST
  console.log('Copying to RANKING_LATEST...');
  
  const copyUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(copyUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: compressed,
      });

      if (response.status === 429) {
        if (attempt === maxRetries - 1) {
          // Don't fail completely - temp key has the data
          console.error('Failed to copy to RANKING_LATEST due to rate limits, but data is in temp key');
          console.error(`Data available at key: ${tempKey}`);
          return; // Consider this a partial success
        }
        
        const baseDelay = 10000; // 10 seconds for main key
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitteredDelay = exponentialDelay + Math.random() * 10000;
        const delay = Math.min(jitteredDelay, 120000);
        
        console.log(`Rate limited on RANKING_LATEST, waiting ${Math.round(delay/1000)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to copy to RANKING_LATEST: ${response.status} - ${error}`);
      }
      
      console.log('Successfully copied to RANKING_LATEST');
      
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
          tempKey: tempKey, // Reference to temp key
        }),
      });
      
      // Step 4: Clean up old temp keys (best effort)
      try {
        await cleanupOldTempKeys(CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN);
      } catch (cleanupError) {
        console.log('Failed to cleanup old temp keys:', cleanupError);
      }
      
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error('Failed to copy to RANKING_LATEST, but data is in temp key');
        console.error(`Data available at key: ${tempKey}`);
        return; // Consider this a partial success
      }
      const delay = Math.min(5000 * Math.pow(2, attempt), 30000);
      console.log(`Copy failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Clean up old temporary keys
async function cleanupOldTempKeys(accountId: string, namespaceId: string, apiToken: string): Promise<void> {
  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?prefix=RANKING_TEMP_`;
  
  try {
    const response = await fetch(listUrl, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
      },
    });
    
    if (!response.ok) {
      return;
    }
    
    const data = await response.json();
    const keys = data.result || [];
    
    // Keep only the last 5 temp keys
    if (keys.length > 5) {
      const keysToDelete = keys.slice(5);
      for (const key of keysToDelete) {
        try {
          await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key.name}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${apiToken}`,
            },
          });
          console.log(`Deleted old temp key: ${key.name}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  } catch (e) {
    // Ignore cleanup errors
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
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;
    
    const genreCount = Object.keys(rankingData.genres).length;
    console.log(`\nAggregated ${genreCount} genres with ${totalItemsCount} total items`);
    
    if (genreCount === 0) {
      console.error('No data to write!');
      process.exit(1);
    }

    // Write to Cloudflare KV with improved strategy
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