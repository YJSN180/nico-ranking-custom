#!/usr/bin/env node

// Emergency rollback - switch to the other color immediately
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '5984977746a3dfcd71415bed5c324eb1';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = '19c56f381658417397c0b19320167a26'; // MAINTENANCE_FLAGS

if (!API_TOKEN) {
  console.error('Error: CLOUDFLARE_API_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`
};

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}`;

async function emergencyRollback() {
  console.log('🚨 EMERGENCY ROLLBACK INITIATED\n');

  try {
    // Get current active worker
    const currentResponse = await fetch(`${baseUrl}/values/active_worker`, {
      headers
    });

    if (!currentResponse.ok) {
      throw new Error('Failed to get current active_worker');
    }

    const currentWorker = await currentResponse.text();
    console.log(`Current active worker: ${currentWorker}`);

    // Determine target worker
    const targetWorker = currentWorker === 'blue' ? 'green' : 'blue';
    console.log(`Rolling back to: ${targetWorker}`);

    // Switch to the other worker
    const switchResponse = await fetch(`${baseUrl}/values/active_worker`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'text/plain'
      },
      body: targetWorker
    });

    if (!switchResponse.ok) {
      const error = await switchResponse.text();
      throw new Error(`Failed to switch active_worker: ${error}`);
    }

    console.log(`\n✅ Successfully rolled back to ${targetWorker.toUpperCase()} Worker`);

    // Update routing config
    const routingConfig = {
      default: targetWorker,
      blue_green_enabled: true,
      canary_percentage: 0,
      rules: [],
      feature_flags: {
        active_color: targetWorker,
        rollback_performed: new Date().toISOString()
      }
    };

    await fetch(`${baseUrl}/values/routing_config`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(routingConfig)
    });

    // Verify the rollback
    console.log('\n📊 Verifying rollback...');
    const verifyResponse = await fetch('https://nico-rank.com/api/debug');
    
    if (verifyResponse.ok) {
      const debugInfo = await verifyResponse.json();
      console.log(`Active worker in production: ${debugInfo.activeWorker}`);
      
      if (debugInfo.activeWorker === targetWorker) {
        console.log('\n🎉 Rollback completed successfully!');
        console.log(`${targetWorker.toUpperCase()} Worker is now serving traffic`);
      } else {
        console.error('⚠️  Warning: Rollback may not have propagated yet. Check again in a few seconds.');
      }
    }

  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    console.error('\n🔧 Manual intervention required:');
    console.error('1. Log into Cloudflare dashboard');
    console.error('2. Navigate to Workers & Pages > KV > MAINTENANCE_FLAGS');
    console.error('3. Manually update "active_worker" value');
    process.exit(1);
  }
}

// Run the emergency rollback
emergencyRollback();