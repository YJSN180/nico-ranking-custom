# Vercel Environment Variables Setup

## Using Vercel CLI

1. Install Vercel CLI if not already installed:
```bash
npm i -g vercel
```

2. Link to your project:
```bash
vercel link
```

3. Add environment variables:
```bash
# For production
vercel env add CLOUDFLARE_ACCOUNT_ID production
# Enter value: 5984977746a3dfcd71415bed5c324eb1

vercel env add CLOUDFLARE_KV_NAMESPACE_ID production
# Enter value: 80f4535c379b4e8cb89ce6dbdb7d2dc9

vercel env add CLOUDFLARE_KV_API_TOKEN_READ production
# Enter value: <Your_Read_Only_Token>

# Also add for preview and development environments
vercel env add CLOUDFLARE_ACCOUNT_ID preview development
vercel env add CLOUDFLARE_KV_NAMESPACE_ID preview development
vercel env add CLOUDFLARE_KV_API_TOKEN_READ preview development
```

## Using Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project: `nico-ranking-custom`
3. Go to Settings → Environment Variables
4. Add the following variables:

| Key | Value | Environments |
|-----|-------|--------------|
| CLOUDFLARE_ACCOUNT_ID | 5984977746a3dfcd71415bed5c324eb1 | Production, Preview, Development |
| CLOUDFLARE_KV_NAMESPACE_ID | 80f4535c379b4e8cb89ce6dbdb7d2dc9 | Production, Preview, Development |
| CLOUDFLARE_KV_API_TOKEN_READ | <Your_Token> | Production, Preview, Development |

## Cloudflare Read-Only Token

Create a read-only token for Vercel:

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Custom token
3. Permissions:
   - Account → Workers KV Storage → Read
4. Account Resources: Include → Your Account
5. Create and copy the token

## Verify Setup

After adding environment variables, redeploy:

```bash
vercel --prod
```

Or trigger a redeploy from the Vercel dashboard.

## Test the API

Once deployed, test the Cloudflare KV API:

```bash
curl https://your-app.vercel.app/api/ranking-cf?genre=all&period=24h
```