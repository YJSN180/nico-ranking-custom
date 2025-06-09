# Vercel + Convex + Cloudflare KV Setup Guide

## Overview

This document describes how to set up the Nico Ranking Custom app with:
- **Vercel**: Frontend hosting and API routes
- **Convex**: Cron jobs for data fetching (every 10 minutes)
- **Cloudflare KV**: Compressed data storage (single write per update)

## Architecture

```
Convex Cron (10min) → Fetch 23 genres × 2 periods × 500 items + tags
                    ↓
                    Compress with gzip
                    ↓
                    Single write to Cloudflare KV
                    ↓
Vercel Edge API ← Read and decompress on demand
```

## Setup Instructions

### 1. Cloudflare KV Setup

1. Create a KV namespace in Cloudflare dashboard
2. Note down:
   - Account ID: `5984977746a3dfcd71415bed5c324eb1`
   - Namespace ID: `80f4535c379b4e8cb89ce6dbdb7d2dc9`
   - Create an API token with KV write permissions

### 2. Convex Setup

1. Install Convex CLI:
   ```bash
   npm install -g convex
   ```

2. Initialize Convex in the project:
   ```bash
   npx convex dev
   ```

3. Set environment variables in Convex dashboard:
   ```
   CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
   CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
   CLOUDFLARE_KV_API_TOKEN=your_api_token_here
   ```

### 3. Vercel Setup

1. Deploy to Vercel:
   ```bash
   vercel
   ```

2. Set environment variables in Vercel dashboard:
   ```
   # For API routes that need to read from Cloudflare KV
   CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
   CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
   CLOUDFLARE_KV_API_TOKEN_READ=your_read_only_token_here
   
   # Existing KV variables (keep for backward compatibility)
   KV_REST_API_URL=your_existing_kv_url
   KV_REST_API_TOKEN=your_existing_kv_token
   ```

## Data Structure

The data is stored in Cloudflare KV as a single compressed bundle:

```typescript
{
  genres: {
    [genre: string]: {
      '24h': {
        items: RankingItem[],      // 500 items
        popularTags: string[],     // Popular tags for this genre
        tags: {                    // Tag-specific rankings
          [tag: string]: RankingItem[]  // 500 items per tag
        }
      },
      'hour': {
        items: RankingItem[],
        popularTags: string[],
        tags: {
          [tag: string]: RankingItem[]
        }
      }
    }
  },
  metadata: {
    version: 1,
    updatedAt: string,  // ISO timestamp
    totalItems: number
  }
}
```

## API Endpoints

### Cloudflare KV API (New)
```
GET /api/ranking-cf?genre=game&period=24h
GET /api/ranking-cf?genre=other&period=hour&tag=VOCALOID
GET /api/ranking-cf?genre=all&period=24h&limit=100&offset=0
```

### Legacy Vercel KV API (Backward Compatible)
```
GET /api/ranking?genre=game&period=24h
```

## Cron Job

The Convex cron job runs every 10 minutes and:
1. Fetches all 23 genres for both periods (24h and hour)
2. Fetches up to 500 items per genre/period
3. Extracts popular tags from server response
4. Fetches tag-specific rankings for all popular tags
5. Compresses all data with gzip
6. Makes a single write to Cloudflare KV

## Monitoring

Check cron job status:
```bash
npx convex logs
```

View cron job history in Convex dashboard under "Functions" → "updateAllRankings"

## Free Tier Limits

- **Cloudflare KV**: 1,000 writes/day, 100,000 reads/day, 1MB per value
- **Convex**: 100M function calls/month
- **10-minute intervals**: 144 writes/day (well within limits)

## Thumbnail Resolution

All thumbnail URLs are automatically converted from `.M` (320×180) to `.L` (640×360) format for higher resolution display.

## Testing

Run integration tests:
```bash
npm test -- __tests__/integration/convex-cloudflare-kv.test.ts
npm test -- __tests__/integration/vercel-edge-kv-api.test.ts
```

## Deployment Checklist

- [ ] Cloudflare KV namespace created
- [ ] Cloudflare API token generated with KV write permissions
- [ ] Convex project initialized
- [ ] Convex environment variables set
- [ ] Vercel project deployed
- [ ] Vercel environment variables set
- [ ] Cron job running successfully
- [ ] API endpoints responding correctly
- [ ] Data compression working (< 1MB per write)