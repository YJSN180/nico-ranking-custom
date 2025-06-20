#!/usr/bin/env npx tsx
import 'dotenv/config'

async function checkKVFormat() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.error("Cloudflare KV credentials not configured");
    process.exit(1);
  }

  // Check for both old single-key and new 3-key structure
  const keys = ['RANKING_LATEST', 'RANKING_GROUP_1', 'RANKING_GROUP_2', 'RANKING_GROUP_3'];
  
  for (const key of keys) {
    console.log(`\n========== Checking ${key} ==========`);
    
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });

    if (response.status === 404) {
      console.log(`❌ ${key} not found`);
      continue;
    }

    if (!response.ok) {
      console.error(`Failed to fetch ${key}: ${response.status}`);
      continue;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    console.log(`Data size: ${bytes.length} bytes (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`First 4 bytes: ${Array.from(bytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Check if it's gzipped (starts with 0x1f 0x8b)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      console.log('✅ Data is GZIP compressed');
      
      // Try to decompress
      try {
        const pako = await import('pako');
        const decompressed = pako.ungzip(bytes);
        const jsonString = new TextDecoder().decode(decompressed);
        const data = JSON.parse(jsonString);
        
        console.log(`Decompressed size: ${jsonString.length} bytes (${(jsonString.length / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`Compression ratio: ${(bytes.length / jsonString.length * 100).toFixed(1)}%`);
        console.log('Data structure:', {
          genres: Object.keys(data.genres || {}).length,
          genreNames: Object.keys(data.genres || {}).join(', '),
          metadata: data.metadata
        });
      } catch (error) {
        console.error('Failed to decompress:', error);
      }
    } else {
      console.log('❌ Data is NOT GZIP compressed');
      
      // Try to parse as JSON
      try {
        const jsonString = new TextDecoder().decode(bytes);
        const data = JSON.parse(jsonString);
        console.log('Data is plain JSON');
        console.log('Data structure:', {
          genres: Object.keys(data.genres || {}).length,
          genreNames: Object.keys(data.genres || {}).join(', '),
          metadata: data.metadata
        });
      } catch (error) {
        console.log('Data is neither gzipped nor valid JSON');
      }
    }
    
    // Check metadata via separate endpoint
    console.log('\nChecking metadata...');
    const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}?key_info=true`;
    
    const metadataResponse = await fetch(metadataUrl, {
      method: 'HEAD',
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (metadataResponse.ok) {
      console.log('Metadata response headers:');
      metadataResponse.headers.forEach((value, key) => {
        if (key.toLowerCase().includes('metadata') || key.toLowerCase().includes('cf-kv')) {
          console.log(`  ${key}: ${value}`);
        }
      });
    }
  }
  
  // Summary
  console.log('\n========== Summary ==========');
  console.log('This script checks both old single-key (RANKING_LATEST) and new 3-key structure (RANKING_GROUP_1/2/3)');
  console.log('The system should be using the 3-key structure for better performance.');
}

checkKVFormat().catch(console.error);