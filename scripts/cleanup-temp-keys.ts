#!/usr/bin/env npx tsx
import 'dotenv/config'

async function cleanupAllTempKeys() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?prefix=RANKING_TEMP_`;
  
  try {
    const response = await fetch(listUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list keys: ${response.status}`);
    }
    
    const data = await response.json();
    const keys = data.result || [];
    
    console.log(`Found ${keys.length} RANKING_TEMP_* keys to delete`);
    
    for (const key of keys) {
      try {
        const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key.name}`;
        const deleteResponse = await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
          },
        });
        
        if (deleteResponse.ok) {
          console.log(`✅ Deleted: ${key.name}`);
        } else {
          console.log(`❌ Failed to delete: ${key.name}`);
        }
      } catch (e) {
        console.error(`Error deleting ${key.name}:`, e);
      }
    }
    
    console.log('\nCleanup completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupAllTempKeys();