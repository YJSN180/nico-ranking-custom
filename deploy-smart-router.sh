#!/bin/bash

# Deploy Smart Router with updated Green Worker binding
# This script safely loads Cloudflare credentials and deploys the Smart Router

set -e  # Exit on error

echo "🚀 Deploying Smart Router with updated Green Worker binding..."

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

# Deploy Smart Router
echo "📦 Deploying Smart Router..."
wrangler deploy

echo "✅ Smart Router deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Test the production site: https://nico-rank.com"
echo "2. Check if CSP errors are resolved in browser console"
echo "3. Monitor logs: wrangler tail nico-ranking-api-gateway"