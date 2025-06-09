# Environment Variables Setup Guide

## Convex Environment Variables

Set these in the Convex dashboard (https://dashboard.convex.dev/):

```
CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
CLOUDFLARE_KV_API_TOKEN=<Your Cloudflare API Token with KV write permissions>
```

### How to set in Convex:
1. Go to your project in Convex dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with the values above
4. The API token should have permissions for:
   - Account: Cloudflare Workers KV Storage:Edit
   - Zone: Cache Purge:Purge

## Vercel Environment Variables

Set these in the Vercel dashboard (https://vercel.com/):

```
# For Cloudflare KV reading (if using the KV API route)
CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
CLOUDFLARE_KV_API_TOKEN_READ=<Your Cloudflare API Token with KV read permissions>

# Existing Vercel KV (keep these for backward compatibility)
KV_REST_API_URL=<Your existing Vercel KV URL>
KV_REST_API_TOKEN=<Your existing Vercel KV token>
```

### How to set in Vercel:
1. Go to your project in Vercel dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable for Production, Preview, and Development environments
4. Redeploy your application after adding variables

## Cloudflare API Token Creation

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Custom token" template
4. Set permissions:
   - Account → Cloudflare Workers KV Storage → Edit (for Convex)
   - Account → Cloudflare Workers KV Storage → Read (for Vercel)
5. Set Account Resources: Include → Your Account
6. Create token and copy the value

## Testing the Setup

After setting up environment variables:

1. Test Convex cron job:
   ```bash
   npx convex run updateRanking:updateAllRankings
   ```

2. Check Convex logs:
   ```bash
   npx convex logs
   ```

3. Verify data in Cloudflare KV:
   - Go to Cloudflare dashboard
   - Navigate to Workers & Pages → KV
   - Check for key: `ranking-data-bundle`