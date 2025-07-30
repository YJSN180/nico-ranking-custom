#!/bin/bash

# Deploy Green Worker with environment variables from .env.local
# This script safely loads Cloudflare credentials and deploys the Green Worker

set -e  # Exit on error

echo "🚀 Deploying Green Worker 20250726..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    exit 1
fi

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Verify required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN not found in .env.local"
    exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ Error: CLOUDFLARE_ACCOUNT_ID not found in .env.local"
    exit 1
fi

echo "✅ Environment variables loaded successfully"

# Deploy Green Worker
echo "📦 Deploying api-gateway-green-20250726..."
cd workers
wrangler deploy -c wrangler-green.toml

echo "✅ Green Worker deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Test the deployed worker: https://api-gateway-green-20250726.your-subdomain.workers.dev"
echo "2. Update Smart Router if needed to use this Green Worker"
echo "3. Monitor logs: wrangler tail api-gateway-green-20250726"