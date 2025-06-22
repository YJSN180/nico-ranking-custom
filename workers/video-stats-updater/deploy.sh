#!/bin/bash

echo "🚀 Deploying video-stats-updater Worker..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler is not installed"
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: wrangler.toml not found"
    echo "Please run this script from the workers/video-stats-updater directory"
    exit 1
fi

# Set the API key if provided
if [ -n "$1" ]; then
    echo "📝 Setting SNAPSHOT_API_KEY..."
    echo "$1" | wrangler secret put SNAPSHOT_API_KEY
fi

# Deploy to production
echo "🔧 Deploying to production environment..."
wrangler deploy

# Check deployment status
if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 Worker Details:"
    echo "- Name: video-stats-updater"
    echo "- Schedule: Every 2 minutes (*/2 * * * *)"
    echo "- KV Namespace: STATS_KV"
    echo "- R2 Bucket: nico-ranking"
    echo ""
    echo "🔍 You can monitor the Worker at:"
    echo "https://dash.cloudflare.com/?to=/:account/workers/services/view/video-stats-updater"
else
    echo "❌ Deployment failed!"
    exit 1
fi