#!/bin/bash

# Script to set up WORKER_AUTH_KEY for Cloudflare Workers
# This script helps you configure the authentication key without exposing it

echo "🔐 Setting up WORKER_AUTH_KEY for Cloudflare Workers"
echo "=================================================="
echo ""
echo "Generated key: 71a0bb0096d33af5bc1b88e09185440428da5797255c30bcc4ef2c8969b6a603"
echo ""
echo "Please follow these steps:"
echo ""
echo "1. Set up wrangler.toml:"
echo "   cp wrangler.toml.example wrangler.toml"
echo "   # Edit wrangler.toml with your actual Cloudflare account details"
echo ""
echo "2. Set the secret in Cloudflare Workers:"
echo "   wrangler secret put WORKER_AUTH_KEY"
echo "   # Paste the key when prompted"
echo ""
echo "3. Add to Vercel Environment Variables:"
echo "   - Go to Vercel Dashboard → Settings → Environment Variables"
echo "   - Add WORKER_AUTH_KEY with the above value"
echo "   - Enable for all environments (Production, Preview, Development)"
echo ""
echo "4. Deploy the Worker:"
echo "   npm run deploy:worker"
echo ""
echo "⚠️  IMPORTANT: Never commit this key to Git!"