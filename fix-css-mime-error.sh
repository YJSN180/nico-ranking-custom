#!/bin/bash

# Fix CSS MIME type error by rebuilding with corrected webpack configuration
# This script fixes the issue where CSS files were being loaded as <script> tags

set -e  # Exit on error

echo "🚨 Fixing CSS MIME Type Error..."
echo "Problem: CSS files were being treated as JavaScript chunks due to splitChunks configuration"
echo "Solution: Removed CSS files from webpack splitChunks configuration"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    exit 1
fi

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

echo "✅ Environment variables loaded"

# Step 1: Clear Next.js build cache to ensure clean build
echo "🧹 Clearing Next.js build cache..."
rm -rf .next
echo "✅ Build cache cleared"

# Step 2: Rebuild Next.js application with fixed configuration
echo "📦 Building Next.js application with fixed webpack configuration..."
npm run build

echo "✅ Build completed successfully"

# Step 3: Deploy to Vercel (if using Vercel)
if command -v vercel &> /dev/null; then
    echo "🚀 Deploying to Vercel..."
    vercel --prod --yes
else
    echo "⚠️  Vercel CLI not found. Skipping Vercel deployment."
fi

echo ""
echo "🎉 CSS MIME Type Error Fix Complete!"
echo ""
echo "📝 What was fixed:"
echo "- Removed CSS files from webpack splitChunks configuration"
echo "- CSS files will now load correctly as <link> tags instead of <script> tags"
echo "- Next.js built-in CSS optimization will handle CSS processing"
echo ""
echo "🔍 Next steps:"
echo "1. Test in incognito/private mode: https://nico-rank.com"
echo "2. Check browser console - CSS MIME type error should be gone"
echo "3. Verify that styles are loading correctly"
echo ""
echo "⚠️  If the error persists, check Cloudflare caching:"
echo "Cloudflare Dashboard > Caching > Configuration > Purge Everything"