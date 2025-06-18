#!/bin/bash

echo "Triggering a new Vercel deployment..."

# Create an empty commit to trigger deployment
git commit --allow-empty -m "chore: Trigger deployment with Cloudflare environment variables

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_KV_NAMESPACE_ID  
- CLOUDFLARE_KV_API_TOKEN

This deployment includes the Cloudflare KV configuration (RATE_LIMIT removed)."

# Push to current branch
git push

echo "Deployment triggered! Check Vercel dashboard for progress."