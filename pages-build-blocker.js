#!/usr/bin/env node

/**
 * Cloudflare Pages Build Blocker
 * 
 * This script intentionally fails when run in Cloudflare Pages environment
 * to prevent accidental deployments of this Vercel + Workers project.
 */

const isCloudflarePages = process.env.CF_PAGES === '1' || 
                         process.env.CF_PAGES_BRANCH || 
                         process.env.CF_PAGES_COMMIT_SHA ||
                         process.env.CF_PAGES_URL;

if (isCloudflarePages) {
  console.error(`
🚫 CLOUDFLARE PAGES DEPLOYMENT BLOCKED

This project is configured for Vercel + Cloudflare Workers architecture.
Cloudflare Pages deployment is not supported and should be disabled.

Correct deployment setup:
- Main Application: Vercel (Next.js) ✅
- API Gateway: Cloudflare Workers ✅  
- Storage: Cloudflare KV ✅
- This Pages Build: BLOCKED ❌

To fix this issue:
1. Go to Cloudflare Dashboard → Pages
2. Delete or disable the Pages project for this repository
3. Keep only the Workers configuration

See DISABLE_CLOUDFLARE_PAGES.md for detailed instructions.
`);
  process.exit(1);
}

console.log('✅ Not in Cloudflare Pages environment - continuing...');