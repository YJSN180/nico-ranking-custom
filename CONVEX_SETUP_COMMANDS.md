# Convex Setup Commands

## 1. Install Convex CLI and Login

```bash
npx convex dev
```

This will open a browser window to authenticate with Convex.

## 2. Deploy Convex Functions

```bash
npx convex deploy
```

## 3. Set Environment Variables

After deployment, set the following environment variables in the Convex dashboard:

```bash
# Using Convex CLI
npx convex env set CLOUDFLARE_ACCOUNT_ID 5984977746a3dfcd71415bed5c324eb1
npx convex env set CLOUDFLARE_KV_NAMESPACE_ID 80f4535c379b4e8cb89ce6dbdb7d2dc9
npx convex env set CLOUDFLARE_KV_API_TOKEN <Your_Cloudflare_API_Token>
```

## 4. Test the Cron Job

```bash
# Run the update function manually
npx convex run updateRanking:updateAllRankings
```

## 5. Check Logs

```bash
npx convex logs
```

## Cloudflare API Token Setup

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create a new token with these permissions:
   - Account → Workers KV Storage → Edit
   - Zone Resources: Include → All zones from an account → Your Account

## Verify Setup

After setting up, you can verify the environment variables:

```bash
npx convex env list
```

## Schedule Cron Jobs

The cron job is already configured in `convex/crons.ts` to run every 10 minutes.
It will start automatically once deployed.