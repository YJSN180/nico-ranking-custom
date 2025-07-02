#!/usr/bin/env node

// Update KV routing configuration using Cloudflare API
// This script updates the routing configuration to use the current Green Worker

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '5984977746a3dfcd71415bed5c324eb1';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = '19c56f381658417397c0b19320167a26'; // MAINTENANCE_FLAGS

if (!API_TOKEN) {
  console.error('Error: CLOUDFLARE_API_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json'
};

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}`;

// Update routing configuration
async function updateRoutingConfig() {
  // Current configuration maintains Blue/Green naming
  const routingConfig = {
    default: 'green',  // 現在の本番Worker
    blue_green_enabled: true,
    canary_percentage: 0,
    rules: [],
    feature_flags: {
      html_decode: 'green',  // HTMLデコード機能はGreen Workerで有効
      dynamic_ttl: 'green'   // 動的TTL機能もGreen Workerで有効
    }
  };

  console.log('Updating routing configuration...');
  console.log(JSON.stringify(routingConfig, null, 2));

  try {
    // Update routing_config
    const response = await fetch(`${baseUrl}/values/routing_config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(routingConfig)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update routing_config: ${error}`);
    }

    console.log('✅ Routing configuration updated successfully');

    // Ensure active_worker is set to green for backward compatibility
    const activeWorkerResponse = await fetch(`${baseUrl}/values/active_worker`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'text/plain'
      },
      body: 'green'
    });

    if (!activeWorkerResponse.ok) {
      const error = await activeWorkerResponse.text();
      throw new Error(`Failed to update active_worker: ${error}`);
    }

    console.log('✅ Active worker set to "green" for backward compatibility');

    // Verify the configuration
    console.log('\nVerifying configuration...');
    const verifyResponse = await fetch(`${baseUrl}/values/routing_config`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (verifyResponse.ok) {
      const value = await verifyResponse.text();
      console.log('Current routing_config:', value);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the update
updateRoutingConfig();