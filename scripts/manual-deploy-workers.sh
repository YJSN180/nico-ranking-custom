#!/bin/bash
# Manual deployment script for Workers
# Usage: ./scripts/manual-deploy-workers.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/wrangler-with-token.sh"

echo "=== Cloudflare Workers Manual Deployment ==="
echo ""

# Check if wrangler wrapper is available
if [ ! -x "$WRANGLER" ]; then
    echo "Error: Wrangler wrapper is not available: $WRANGLER"
    exit 1
fi

# Check authentication
echo "Checking Cloudflare authentication..."
if ! "$WRANGLER" whoami &> /dev/null; then
    echo "Error: Not authenticated with Cloudflare"
    echo "Set CLOUDFLARE_API_TOKEN in .dev.vars or export it before running this script"
    exit 1
fi

echo "✅ Authentication successful"
echo ""

# Function to deploy a worker
deploy_worker() {
    local name=$1
    local file=$2
    local config=$3
    
    echo "Deploying $name..."
    if [[ -f "$config" ]]; then
        echo "Using config: $config"
        "$WRANGLER" deploy "$file" --name "$name" -c "$config"
    else
        echo "Using default config"
        "$WRANGLER" deploy "$file" --name "$name"
    fi
    echo "✅ $name deployed successfully"
    echo ""
}

# Deploy v1-stable (Green Worker with HTML decode)
echo "=== Phase 1: Deploy v1-stable Worker ==="
deploy_worker "nico-ranking-v1-stable" \
    "workers/api-gateway-r2-with-dynamic-ttl-and-kv-maintenance.ts" \
    "wrangler-v1-stable.toml"

# Update Service Bindings
echo "=== Phase 2: Update Service Bindings ==="
echo "Note: Service bindings need to be updated in the Cloudflare dashboard"
echo "1. Go to Workers & Pages > nico-ranking-api-gateway > Settings > Variables"
echo "2. Add Service Binding: WORKER_V1_STABLE = nico-ranking-v1-stable"
echo ""
read -p "Press Enter when Service Bindings are updated..."

# Deploy Smart Router v2
echo "=== Phase 3: Deploy Smart Router v2 ==="
deploy_worker "nico-ranking-api-gateway" \
    "workers/api-gateway-smart-router-v2.ts" \
    "wrangler-router-v2.toml"

echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Update KV routing_config to use v1-stable"
echo "2. Test the deployment: curl https://nico-rank.com/api/debug"
echo "3. Monitor Worker logs: wrangler tail nico-ranking-api-gateway"
