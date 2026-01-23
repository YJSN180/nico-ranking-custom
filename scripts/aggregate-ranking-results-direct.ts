#!/usr/bin/env npx tsx
import * as fs from 'fs/promises'
import * as path from 'path'
import { gunzip } from 'zlib'
import { promisify } from 'util'
import { GENRE_GROUPS, type RankingGenre } from '../types/ranking-config'
import { compressForStorage } from '../lib/unified-compression.js'

const gunzipAsync = promisify(gunzip)

// Fetch existing KV group data and decompress it
async function fetchExistingKVGroupData(groupId: string): Promise<any | null> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    return null;
  }

  const keyName = `RANKING_GROUP_${groupId}`;
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.log(`No existing data for ${keyName} (${response.status})`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if gzip compressed (magic bytes: 1f 8b)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      const decompressed = await gunzipAsync(buffer);
      return JSON.parse(decompressed.toString('utf-8'));
    } else {
      return JSON.parse(buffer.toString('utf-8'));
    }
  } catch (error) {
    console.log(`Error fetching ${keyName}:`, error);
    return null;
  }
}

// Save derived NG entries to KV
async function saveDerivedNGEntriesToKV(newEntries: string[]): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

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
async function writeToCloudflareKV(data: any, keyName: string = 'RANKING_LATEST'): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  const jsonString = JSON.stringify(data);
  const dataSize = jsonString.length / 1024 / 1024;
  console.log(`Data size: ${dataSize.toFixed(2)} MB (uncompressed)`);
  
  // Compress to reduce size and improve Worker performance
  console.log(`Compressing data...`);
  const compressionResult = await compressForStorage(data);
  const compressed = Buffer.from(compressionResult.compressedData);
  const compressedSize = compressed.length / 1024 / 1024;
  console.log(`Compressed size: ${compressedSize.toFixed(2)} MB (${compressionResult.metadata.compressionRatio.toFixed(1)}% reduction)`)

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`;
  
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
      
      console.log(`✅ Successfully wrote to ${keyName}`);
      
      // Set metadata
      const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${keyName}`;
      
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

// Write data split by 6 groups (GENRE_GROUPS structure - getthumbinfo APIレート制限対策)
// This function MERGES new data with existing KV data for partial updates
// It preserves genres that are not in the current update
async function writeToCloudflareKVGroups(rankingData: any): Promise<void> {
  console.log('\n📦 Starting group-based KV write with merge support...');
  console.log('Note: Writing to GENRE_GROUPS (6 groups) - merging with existing data for partial updates');

  // Log which genres we have data for
  const availableGenres = Object.keys(rankingData.genres || {});
  console.log(`Available genres in this update: ${availableGenres.join(', ')} (${availableGenres.length} genres)`);

  // Calculate size of each group before writing
  const groupSizes: Record<string, number> = {};
  let writtenCount = 0;

  for (const [groupId, genreList] of Object.entries(GENRE_GROUPS)) {
    // Check which genres in this group have new data
    let hasNewData = false;
    let genresWithNewData: string[] = [];
    for (const genre of genreList) {
      if (rankingData.genres[genre]) {
        hasNewData = true;
        genresWithNewData.push(genre);
      }
    }

    // Skip if no new data for this group
    if (!hasNewData) {
      console.log(`⏭️  Group ${groupId} has no new data, skipping (existing KV data preserved)`);
      continue;
    }

    // Fetch existing KV data to merge with
    console.log(`🔄 Fetching existing data for Group ${groupId} to merge...`);
    const existingData = await fetchExistingKVGroupData(groupId);

    // Create merged group data
    const groupData = {
      genres: {} as any,
      metadata: {
        ...rankingData.metadata,
        groupId: parseInt(groupId),
        genresInGroup: genreList
      }
    };

    // Start with existing genres (if any)
    let genresFromExisting: string[] = [];
    if (existingData?.genres) {
      for (const genre of genreList) {
        if (existingData.genres[genre] && !rankingData.genres[genre]) {
          // Keep existing data for genres not in current update
          groupData.genres[genre] = existingData.genres[genre];
          genresFromExisting.push(genre);
        }
      }
    }

    // Add/overwrite with new data
    for (const genre of genreList) {
      if (rankingData.genres[genre]) {
        groupData.genres[genre] = rankingData.genres[genre];
      }
    }

    const totalGenres = Object.keys(groupData.genres).length;
    console.log(`Group ${groupId}: ${genresWithNewData.length} new genres (${genresWithNewData.join(', ')})`);
    if (genresFromExisting.length > 0) {
      console.log(`         + ${genresFromExisting.length} existing genres preserved (${genresFromExisting.join(', ')})`);
    }

    // Calculate and log size
    const groupSize = JSON.stringify(groupData).length / 1024 / 1024;
    groupSizes[groupId] = groupSize;
    console.log(`         = ${totalGenres}/${genreList.length} total genres, ${groupSize.toFixed(2)} MB`);

    // Write this group to KV
    try {
      await writeToCloudflareKV(groupData, `RANKING_GROUP_${groupId}`);
      writtenCount++;
    } catch (error) {
      console.error(`Failed to write group ${groupId}:`, error);
      throw error;
    }
  }

  console.log(`\n✅ Successfully wrote ${writtenCount}/6 groups to KV`);
  console.log('Written group sizes:', groupSizes);
}

async function main() {
  try {
    console.log('Aggregating ranking results...');

    // Detect mode: KV group mode (new) or legacy 8-group mode
    const kvGroupMode = process.env.KV_GROUP_MODE === 'true';
    console.log(`Mode: ${kvGroupMode ? 'KV Group (6 groups, no merge needed)' : 'Legacy (8 groups, with merge)'}`);

    // Read all partial results
    const tmpDir = './tmp';
    let files: string[] = [];
    try {
      files = await fs.readdir(tmpDir);
    } catch (error) {
      console.error('Failed to read tmp directory:', error);
      process.exit(1);
    }

    // Support both file naming conventions
    const kvGroupFiles = files.filter(f => f.startsWith('ranking-kv-group-') && f.endsWith('.json'));
    const legacyGroupFiles = files.filter(f => f.startsWith('ranking-group-') && f.endsWith('.json'));
    const groupFiles = kvGroupFiles.length > 0 ? kvGroupFiles : legacyGroupFiles;

    console.log(`Found ${kvGroupFiles.length} KV group files, ${legacyGroupFiles.length} legacy group files`);
    console.log(`Using: ${kvGroupFiles.length > 0 ? 'KV group files' : 'legacy group files'}`);

    // Look for NG derived files in both main tmp and subdirectories
    const ngDerivedFiles: string[] = [];
    // Note: exec() is used here with hardcoded paths only, no user input - safe from injection
    const allNgFiles = await new Promise<string[]>(async (resolve) => {
      const { exec } = await import('child_process');
      exec('find ./tmp -name "ng-derived-*.json" -type f 2>/dev/null || true', (error: any, stdout: string) => {
        if (error) {
          console.log('No ng-derived files found via find command');
          resolve([]);
          return;
        }
        const found = stdout.trim().split('\n').filter(f => f && f.includes('ng-derived-'));
        console.log(`Found ng-derived files via find: ${found.join(', ')}`);
        resolve(found);
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
        // DEBUG: Tag data structure
        if (result.data['24h'].tags && Object.keys(result.data['24h'].tags).length > 0) {
          console.log(`  ✅ Genre ${result.genre} has ${Object.keys(result.data['24h'].tags).length} tags in 24h`);
          console.log(`     First 3 tags: ${Object.keys(result.data['24h'].tags).slice(0, 3).join(', ')}`);
        } else {
          console.log(`  ❌ Genre ${result.genre} has NO tags in 24h`);
        }
        
        if (result.data['hour'].tags && Object.keys(result.data['hour'].tags).length > 0) {
          console.log(`  ✅ Genre ${result.genre} has ${Object.keys(result.data['hour'].tags).length} tags in hour`);
        } else {
          console.log(`  ❌ Genre ${result.genre} has NO tags in hour`);
        }
        
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

    // Write to Cloudflare KV (6-key分割でWorkerのフォールバック用)
    console.log('\nWriting to Cloudflare KV (6-group split)...');

    // KVは6-key分割で書き込み（Workerのフォールバック機能用）
    await writeToCloudflareKVGroups(rankingData);
    
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
main();