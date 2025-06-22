# GitHub Actions Trigger Worker

This Cloudflare Worker triggers the `update-video-stats` GitHub Actions workflow every 2 minutes.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a GitHub Personal Access Token with `repo` scope:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select `repo` scope
   - Copy the token

3. Add the token as a secret:
   ```bash
   wrangler secret put GITHUB_PAT
   ```

4. Deploy the Worker:
   ```bash
   npm run deploy
   ```

## Why use this?

GitHub Actions scheduled workflows have limitations:
- Minimum reliable interval is 5 minutes
- Actual execution can be delayed by 15-30 minutes
- No guarantee of precise timing

Cloudflare Workers Cron Triggers:
- Support 2-minute intervals
- More reliable execution timing
- Free tier includes 100,000 requests/day
- Cron triggers are free (only the execution counts)

## Monitoring

View logs in the Cloudflare dashboard:
1. Go to Workers & Pages
2. Select "github-trigger"
3. View "Logs" tab

## Cost

- Cloudflare Workers Free tier: 100,000 requests/day
- This worker runs 720 times/day (every 2 minutes)
- Well within the free tier limits