#!/bin/bash

echo "Triggering a new Vercel deployment..."

# Create an empty commit to trigger deployment
git commit --allow-empty -m "chore: Trigger deployment with Cloudflare environment variables

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_KV_NAMESPACE_ID  
- CLOUDFLARE_KV_API_TOKEN
- RATE_LIMIT_NAMESPACE_ID

This deployment includes the new Cloudflare KV configuration."

# Push to current branch
git push

echo "Deployment triggered! Check Vercel dashboard for progress."