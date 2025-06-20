#!/usr/bin/env npx tsx
import 'dotenv/config'
import * as fs from 'fs/promises'
import * as path from 'path'

// Save derived NG entries to KV
async function saveDerivedNGEntriesToKV(newEntries: string[]): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  console.log(`Fetching current derived NG list from KV...`);
  
  // Get current derived list
  const getUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`;
  
  let currentDerived: string[] = [];
  try {
    const response = await fetch(getUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (response.ok) {
      currentDerived = await response.json();
      if (!Array.isArray(currentDerived)) currentDerived = [];
    }
  } catch (error) {
    console.log('No existing derived list found, starting fresh');
  }
  
  // Merge with new entries
  const mergedSet = new Set([...currentDerived, ...newEntries]);
  const mergedList = Array.from(mergedSet);
  
  console.log(`Current derived entries: ${currentDerived.length}`);
  console.log(`New entries to add: ${newEntries.length}`);
  console.log(`Final merged entries: ${mergedList.length}`);
  
  // Save merged list back to KV
  const putUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`;
  
  const response = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mergedList),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save derived NG list to KV: ${response.status} - ${error}`);
  }
  
  console.log('✅ Successfully updated derived NG list in KV');
}

// Write to Cloudflare KV directly (no temp keys)
async function writeToCloudflareKV(data: any): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  const jsonString = JSON.stringify(data);
  const dataSize = jsonString.length / 1024 / 1024;
  console.log(`Data size: ${dataSize.toFixed(2)} MB (uncompressed)`);
  
  // Log data size but don't enforce 25MB limit (actual KV limit is higher)
  console.log(`Note: KV value size limit is 25MB for compressed data, current uncompressed size is ${dataSize.toFixed(2)} MB`)

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;
  
  const maxRetries = 5;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: jsonString,
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
          compressed: false,
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
    // Look for NG derived files in both main tmp and subdirectories
    const ngDerivedFiles: string[] = [];
    const allNgFiles = await new Promise<string[]>((resolve) => {
      const { exec } = require('child_process');
      exec('find ./tmp -name "ng-derived-group-*.json" -type f 2>/dev/null || true', (error: any, stdout: string) => {
        if (error) {
          console.log('No ng-derived files found via find command');
          resolve([]);
          return;
        }
        const found = stdout.trim().split('\n').filter(f => f && f.includes('ng-derived-group-'));
        console.log(`Found ng-derived files via find: ${found.join(', ')}`);
        resolve(found); // Return full paths for direct use
      });
    });
    ngDerivedFiles.push(...allNgFiles);
    
    if (groupFiles.length === 0) {
      console.error('No group result files found in tmp directory');
      console.error('Available files:', files);
      process.exit(1);
    }
    
    console.log(`Found ${groupFiles.length} group result files`);
    console.log(`Found ${ngDerivedFiles.length} NG derived files`);
    
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
    
    // Aggregate derived NG entries
    let totalNewDerived = 0;
    const allNewDerivedEntries = new Set<string>();
    
    if (ngDerivedFiles.length > 0) {
      console.log('\nProcessing derived NG entries...');
      
      for (const file of ngDerivedFiles) {
        console.log(`Processing ${file}...`);
        // Use the full path directly since find returns complete paths
        const content = await fs.readFile(file, 'utf-8');
        
        try {
          const derivedData = JSON.parse(content);
          if (derivedData.newEntries && Array.isArray(derivedData.newEntries)) {
            const newCount = derivedData.newEntries.length;
            totalNewDerived += newCount;
            derivedData.newEntries.forEach((id: string) => allNewDerivedEntries.add(id));
            console.log(`  - ${newCount} new derived entries from ${file}`);
          }
        } catch (error) {
          console.error(`Failed to parse derived NG file ${file}:`, error);
        }
      }
      
      console.log(`Total new derived entries across all groups: ${totalNewDerived}`);
      console.log(`Unique new derived entries: ${allNewDerivedEntries.size}`);
      
      // Save derived entries to KV if any were found
      if (allNewDerivedEntries.size > 0) {
        await saveDerivedNGEntriesToKV(Array.from(allNewDerivedEntries));
      }
    }

    // DO NOT include NG data in public ranking data for security reasons
    // Derived NG list is stored separately in ng-list-derived key

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
    for (const file of ngDerivedFiles) {
      await fs.unlink(file); // Use full path directly
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