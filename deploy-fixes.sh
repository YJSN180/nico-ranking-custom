#!/bin/bash

# Deploy fixes for Feature-Policy duplication and Service Worker issues
# This script rebuilds and deploys the application with the latest fixes

set -e  # Exit on error

echo "🚀 Deploying fixes for browser warnings and errors..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    exit 1
fi

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

echo "✅ Environment variables loaded"

# Step 1: Rebuild Next.js app with updated configuration
echo "📦 Building Next.js application..."
npm run build

echo "✅ Build completed successfully"

# Step 2: Deploy to Vercel (if using Vercel)
if command -v vercel &> /dev/null; then
    echo "🚀 Deploying to Vercel..."
    vercel --prod --yes
else
    echo "⚠️  Vercel CLI not found. Skipping Vercel deployment."
fi

# Step 3: Remind about manual Cloudflare configuration
echo ""
echo "📝 Next steps:"
echo "1. Check Cloudflare Dashboard and disable JavaScript Detections"
echo "2. Clear Cloudflare cache: Caching > Configuration > Purge Everything"
echo "3. Test in incognito/private mode: https://nico-rank.com"
echo "4. Check browser console for resolved warnings"
echo ""
echo "🔍 CSS MIME type error guide: docs/troubleshooting/CSS_MIME_TYPE_ERROR_GUIDE.md"