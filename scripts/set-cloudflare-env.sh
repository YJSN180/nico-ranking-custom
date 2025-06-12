#!/bin/bash

# Cloudflare environment variables configuration
# This script sets up all required Cloudflare KV environment variables in Vercel

echo "Setting Cloudflare environment variables in Vercel..."

# Check if environment variables are set
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_KV_NAMESPACE_ID" ] || [ -z "$CLOUDFLARE_KV_API_TOKEN" ]; then
    echo "Error: Please set the following environment variables before running this script:"
    echo "  - CLOUDFLARE_ACCOUNT_ID"
    echo "  - CLOUDFLARE_KV_NAMESPACE_ID"
    echo "  - CLOUDFLARE_KV_API_TOKEN"
    echo "  - RATE_LIMIT_NAMESPACE_ID (optional)"
    exit 1
fi

# Set environment variables for all environments (production, preview, development)
vercel env add CLOUDFLARE_ACCOUNT_ID production preview development <<< "$CLOUDFLARE_ACCOUNT_ID"
vercel env add CLOUDFLARE_KV_NAMESPACE_ID production preview development <<< "$CLOUDFLARE_KV_NAMESPACE_ID"
vercel env add CLOUDFLARE_KV_API_TOKEN production preview development <<< "$CLOUDFLARE_KV_API_TOKEN"

if [ -n "$RATE_LIMIT_NAMESPACE_ID" ]; then
    vercel env add RATE_LIMIT_NAMESPACE_ID production preview development <<< "$RATE_LIMIT_NAMESPACE_ID"
fi

echo "Environment variables have been configured."
echo "Note: You may need to run 'vercel login' first if not authenticated."
echo ""
echo "To trigger a new deployment, run:"
echo "vercel --prod"