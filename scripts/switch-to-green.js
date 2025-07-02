#!/usr/bin/env node

// Switch active worker to Green
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '5984977746a3dfcd71415bed5c324eb1';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = '19c56f381658417397c0b19320167a26'; // MAINTENANCE_FLAGS

if (!API_TOKEN) {
  console.error('Error: CLOUDFLARE_API_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'text/plain'
};

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}`;

async function switchToGreen() {
  console.log('🔄 Switching to Green Worker...\n');

  try {
    // Update active_worker to "green"
    const response = await fetch(`${baseUrl}/values/active_worker`, {
      method: 'PUT',
      headers,
      body: 'green'
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update active_worker: ${error}`);
    }

    console.log('✅ Successfully switched to Green Worker');

    // Update routing config for consistency
    const routingConfig = {
      default: 'green',
      blue_green_enabled: true,
      canary_percentage: 0,
      rules: [],
      feature_flags: {
        active_color: 'green'
      }
    };

    const configResponse = await fetch(`${baseUrl}/values/routing_config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(routingConfig)
    });

    if (!configResponse.ok) {
      console.warn('⚠️  Warning: Failed to update routing_config');
    } else {
      console.log('✅ Routing configuration updated');
    }

    // Verify the switch
    console.log('\n📊 Verifying deployment...');
    const verifyResponse = await fetch(`${baseUrl}/values/active_worker`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (verifyResponse.ok) {
      const value = await verifyResponse.text();
      console.log(`Current active_worker: ${value}`);
      
      if (value === 'green') {
        console.log('\n🎉 Green Worker is now active!');
        console.log('URL: https://nico-rank.com/');
      } else {
        console.error('❌ Switch may have failed. Please check manually.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the switch
switchToGreen();