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

  // Dynamic import for pako
  const pako = await import('pako');
  
  // 1. Write metadata separately
  const metadata = data.metadata;
  const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ranking-metadata`;
  
  await fetch(metadataUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  
  console.log('Metadata written successfully');
  
  // 2. Write each genre separately to avoid size limits
  const genres = Object.keys(data.genres);
  console.log(`Writing ${genres.length} genres individually...`);
  
  for (const genre of genres) {
    const genreData = data.genres[genre];
    const jsonString = JSON.stringify(genreData);
    const compressed = pako.gzip(jsonString);
    
    console.log(`Writing ${genre}: ${Math.round(compressed.length / 1024)}KB compressed`);
    
    const genreUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ranking-genre-${genre}`;
    
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(genreUrl, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/octet-stream",
          },
          body: compressed,
        });

        if (response.status === 429) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`Rate limited for ${genre}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to write ${genre}: ${response.status} - ${error}`);
        }
        
        break; // Success
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Write failed for ${genre}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Small delay between genres to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // 3. Also write the full data as RANKING_LATEST for backward compatibility
  // (This may fail due to size limits, but that's okay)
  try {
    const fullJsonString = JSON.stringify(data);
    const fullCompressed = pako.gzip(fullJsonString);
    const fullUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`;
    
    console.log(`Writing full data (backward compatibility): ${Math.round(fullCompressed.length / 1024 / 1024 * 10) / 10}MB compressed`);
    
    await fetch(fullUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/octet-stream",
      },
      body: fullCompressed,
    });
    
    console.log('Full data written successfully');
  } catch (error) {
    console.log('Failed to write full data (expected for large datasets):', error);
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
      const groupSizes = [3, 3, 3, 3, 3, 3, 3, 2]; // Group distribution
      let currentIndex = 0;
      const missingGroups: number[] = [];
      
      for (let group = 1; group <= 8; group++) {
        const groupGenres = ALL_GENRES.slice(currentIndex, currentIndex + groupSizes[group - 1]);
        currentIndex += groupSizes[group - 1];
        
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