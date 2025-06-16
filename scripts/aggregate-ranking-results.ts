#!/usr/bin/env npx tsx
import 'dotenv/config'
import * as fs from 'fs/promises'
import * as path from 'path'

// Write to Cloudflare KV via REST API with retry logic
async function writeToCloudflareKV(data: any): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  // Check if another process recently wrote data (within last 5 minutes)
  try {
    const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (metadataResponse.ok) {
      const metadata = await metadataResponse.json();
      if (metadata.result && metadata.result.updatedAt) {
        const lastUpdate = new Date(metadata.result.updatedAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastUpdate.getTime()) / 1000 / 60;
        
        if (diffMinutes < 5) {
          console.log(`Skipping KV write - data was updated ${Math.round(diffMinutes)} minutes ago`);
          console.log(`Last update: ${metadata.result.updatedAt}`);
          return;
        }
      }
    }
  } catch (error) {
    // Ignore metadata check errors
    console.log('Could not check existing data metadata, proceeding with write');
  }

  // Dynamic import for pako
  const pako = await import('pako');
  const jsonString = JSON.stringify(data);
  const compressed = pako.gzip(jsonString);

  // Add a small random delay to prevent concurrent writes from different workflow runs
  const jitter = Math.random() * 5000; // 0-5 seconds
  console.log(`Adding ${Math.round(jitter)}ms jitter before KV write to prevent concurrent access`);
  await new Promise(resolve => setTimeout(resolve, jitter));

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;

  const maxRetries = 3;
  let lastError;
  let writeSuccessful = false;
  
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
        lastError = new Error(`KV write failed: Rate limited (429) after ${attempt + 1} attempts`);
        
        // 最後の試行の場合はエラーを投げる
        if (attempt === maxRetries - 1) {
          console.error(`KV write failed after ${maxRetries} attempts with 429 rate limit`);
          throw lastError;
        }
        
        // 最初のリトライは30秒待つ（大きなペイロードとCloudflare KVの1書き込み/秒制限のため）
        const baseDelay = 30000; // 30秒
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitteredDelay = exponentialDelay + Math.random() * 10000; // Add 0-10s jitter
        const delay = Math.min(jitteredDelay, 120000); // 最大120秒
        console.log(`KV rate limited (429), waiting ${Math.round(delay/1000)}s before retry... (attempt ${attempt + 1}/${maxRetries})`);
        console.log(`Payload size: ${Math.round(compressed.length / 1024)}KB compressed`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }
      
      // Success, break out of retry loop
      writeSuccessful = true;
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

  // Check if write was successful
  if (!writeSuccessful) {
    throw lastError || new Error('KV write failed after all retry attempts');
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
    
    console.log(`Found ${groupFiles.length} group result files:`);
    groupFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
    
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
      console.log(`\nProcessing ${file}...`);
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
      
      console.log(`  Contains ${results.length} genre results`);
      
      for (const result of results) {
        if (!result || !result.genre || !result.data) {
          console.error(`  Invalid result structure in ${file}:`, result);
          continue;
        }
        
        console.log(`  - Adding genre: ${result.genre}`);
        // New structure: result.data contains both '24h' and 'hour'
        rankingData.genres[result.genre] = result.data;
        
        // Count items - タグランキングはスキップされているので除外
        totalItemsCount += result.data['24h'].items.length;
        totalItemsCount += result.data['hour'].items.length;
        
        // タグランキングはもう含まれていない（update-ranking-parallel-v2.tsでスキップ）
        // for (const tagItems of Object.values(result.data['24h'].tags)) {
        //   totalItemsCount += (tagItems as any[]).length;
        // }
        // for (const tagItems of Object.values(result.data['hour'].tags)) {
        //   totalItemsCount += (tagItems as any[]).length;
        // }
      }
    }
    
    rankingData.metadata.totalItems = totalItemsCount;
    
    // Verify all genres are present
    const genreCount = Object.keys(rankingData.genres).length;
    console.log(`\nAggregated ${genreCount} genres with ${totalItemsCount} total items`);
    
    if (genreCount !== 23) {
      console.warn(`\n⚠️  Warning: Expected 23 genres but found ${genreCount}`);
      
      // List which genres we have and which are missing
      const ALL_GENRES = [
        'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
        'entertainment', 'music', 'sing', 'dance', 'play',
        'commentary', 'cooking', 'travel', 'nature', 'vehicle',
        'technology', 'society', 'mmd', 'vtuber', 'radio',
        'sports', 'animal', 'other'
      ];
      
      const foundGenres = Object.keys(rankingData.genres).sort();
      const missingGenres = ALL_GENRES.filter(g => !foundGenres.includes(g));
      
      console.log('\nFound genres:', foundGenres.join(', '));
      console.log('Missing genres:', missingGenres.join(', '));
      
      // Check if missing genres correspond to specific groups
      // Updated to match GitHub Actions workflow (6 groups instead of 8)
      const totalGroups = 6;
      const genresPerGroup = Math.ceil(ALL_GENRES.length / totalGroups);
      const missingGroups: number[] = [];
      
      for (let group = 1; group <= totalGroups; group++) {
        const startIdx = (group - 1) * genresPerGroup;
        const endIdx = Math.min(startIdx + genresPerGroup, ALL_GENRES.length);
        const groupGenres = ALL_GENRES.slice(startIdx, endIdx);
        
        if (groupGenres.every(g => missingGenres.includes(g))) {
          missingGroups.push(group);
        }
      }
      
      if (missingGroups.length > 0) {
        console.log(`\nLikely missing entire groups: ${missingGroups.join(', ')}`);
        console.log('This suggests these group files may be missing or malformed.');
      }
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