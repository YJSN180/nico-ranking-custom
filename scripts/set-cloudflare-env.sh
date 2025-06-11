#!/bin/bash

# Cloudflare environment variables configuration
# This script sets up all required Cloudflare KV environment variables in Vercel

echo "Setting Cloudflare environment variables in Vercel..."

# Set environment variables for all environments (production, preview, development)
vercel env add CLOUDFLARE_ACCOUNT_ID production preview development <<< "5984977746a3dfcd71415bed5c324eb1"
vercel env add CLOUDFLARE_KV_NAMESPACE_ID production preview development <<< "80f4535c379b4e8cb89ce6dbdb7d2dc9"
vercel env add CLOUDFLARE_KV_API_TOKEN production preview development <<< "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
vercel env add RATE_LIMIT_NAMESPACE_ID production preview development <<< "c49751cf8c27464aac68cf030b9e0713"

echo "Environment variables have been configured."
echo "Note: You may need to run 'vercel login' first if not authenticated."
echo ""
echo "To trigger a new deployment, run:"
echo "vercel --prod"