#!/bin/bash

# Domain Authentication Setup Script
# This script generates a secure authentication key and updates configuration

set -e

echo "🔧 Setting up domain authentication for Cloudflare Workers + Vercel"

# Check if wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: wrangler.toml not found. Run from project root."
    exit 1
fi

# Generate secure authentication key
echo "🔑 Generating secure authentication key..."
AUTH_KEY=$(openssl rand -hex 32)

if [ -z "$AUTH_KEY" ]; then
    echo "❌ Error: Failed to generate authentication key"
    exit 1
fi

echo "✅ Generated authentication key: ${AUTH_KEY:0:8}... (truncated for security)"

# Update wrangler.toml
echo "📝 Updating wrangler.toml configuration..."

# Create backup
cp wrangler.toml wrangler.toml.backup

# Replace placeholder with actual key
sed -i.tmp "s/your-secure-worker-auth-key-here/$AUTH_KEY/g" wrangler.toml
rm wrangler.toml.tmp

echo "✅ Updated wrangler.toml with authentication key"

# Show next steps
echo ""
echo "🚨 IMPORTANT NEXT STEPS:"
echo ""
echo "1. Set the same key in Vercel Dashboard:"
echo "   Variable: WORKER_AUTH_KEY"
echo "   Value: $AUTH_KEY"
echo "   Environment: Production"
echo ""
echo "2. Deploy the Workers:"
echo "   npm run deploy:worker"
echo ""
echo "3. Deploy Vercel app (push to main branch)"
echo ""
echo "4. Test the configuration:"
echo "   curl https://nico-rank.com/debug"
echo ""
echo "⚠️  Keep the authentication key secure and do not share it publicly!"
echo "💾 Backup created: wrangler.toml.backup"