#!/bin/bash
# Deploy Green Worker with HTML decode functionality

set -euo pipefail

echo "=== Deploy Green Worker with HTML Decode ==="
echo ""

# Check if CLOUDFLARE_API_TOKEN is set
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN environment variable must be set"
  echo "You can set it by running:"
  echo "  export CLOUDFLARE_API_TOKEN=your_token_here"
  exit 1
fi

# Account ID
export CLOUDFLARE_ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"

echo "1. Deploying Green Worker..."
echo "   Worker name: nico-ranking-green"
echo "   Source file: workers/api-gateway-r2-with-dynamic-ttl-and-kv-maintenance.ts"
echo ""

# Deploy using wrangler
wrangler deploy workers/api-gateway-r2-with-dynamic-ttl-and-kv-maintenance.ts \
  --name nico-ranking-green \
  -c wrangler-green.toml

echo ""
echo "2. Updating KV routing configuration..."

# Update routing configuration using Node.js script
node scripts/update-kv-routing.js

echo ""
echo "3. Verifying deployment..."

# Test the API endpoint
echo "Testing API endpoint..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://nico-rank.com/api/debug || true

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Green Worker has been deployed with:"
echo "- HTML decode functionality"
echo "- Dynamic TTL support"
echo "- KV-based maintenance mode"
echo ""
echo "The Smart Router will automatically route traffic to the Green Worker."