# Video Statistics Update Flow Analysis

## Overview
The application uses a real-time statistics update system to keep video metrics (views, comments, mylists, likes) current for displayed ranking items.

## Real-time Stats Implementation

### 1. Client-Side Hook (`use-realtime-stats.ts`)
- **Update Frequency**: Configurable, default 60 seconds (1 minute)
- **Actual Usage**: Set to 3 minutes (180,000ms) in `client-page.tsx`
- **Videos per Update**: Maximum 50 videos at a time
- **Batch Size**: 10 videos per API request
- **Request Delay**: 100ms between batches

### 2. API Endpoint (`/api/video-stats/route.ts`)
- **Max Videos per Request**: 50
- **Cache Control**: No caching (`no-cache, no-store, must-revalidate`)
- **Response**: Returns stats with timestamp and count

### 3. Snapshot API (`snapshot-api.ts`)
- **API URL**: `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search`
- **Batch Size**: 10 videos per query
- **Rate Limiting**: 100ms delay between batches
- **User-Agent**: Googlebot UA to bypass geo-blocking

## Update Volume Calculations

### Per User Session
- **Update Interval**: 3 minutes
- **Videos per Update**: Up to 50 (visible items)
- **API Calls per Update**: 5 (50 videos ÷ 10 per batch)
- **Updates per Hour**: 20
- **API Calls per Hour**: 100 (20 updates × 5 calls)
- **Daily API Calls per User**: 2,400 (100 × 24 hours)

### System-Wide Updates

#### Cron Job (GitHub Actions)
- **Schedule**: Every 10 minutes
- **Genres**: 23 total genres
- **Periods**: 2 (24h, hour)
- **Base Rankings**: 46 (23 genres × 2 periods)
- **Items per Ranking**: 500 items fetched, 300-500 stored
- **Popular Tags**: ~15 tags per genre
- **Tag Rankings**: Additional rankings for popular tags

#### Cron Job API Calls
Per execution:
- **Genre Rankings**: ~460 calls (46 rankings × ~10 pages each)
- **Tag Rankings**: ~690 calls (46 × 15 tags × 1 page each)
- **Total per Run**: ~1,150 API calls
- **Daily Cron Calls**: ~165,600 (1,150 × 144 runs/day)

## Caching Strategy

### Real-time Stats
- **Client Cache**: None (always fresh data)
- **API Cache**: Disabled (no-cache headers)
- **Update Strategy**: Progressive updates for visible items only

### Ranking Data
- **Vercel KV Cache**: 1 hour TTL
- **Cloudflare KV**: Compressed storage with metadata
- **Storage Keys**:
  - `ranking-{genre}-{period}`: Base rankings
  - `ranking-{genre}-{period}-tag-{tag}`: Tag rankings
  - `RANKING_LATEST`: Complete dataset in Cloudflare KV

## Rate Limiting & Throttling

### Built-in Delays
1. **Real-time Updates**: 100ms between batches
2. **Cron Scraping**: 500ms between pages
3. **Tag Scraping**: 500ms between tags

### Rate Limiter Configuration
- **API Endpoint**: 10 requests per 10 seconds
- **Admin Endpoints**: 5 requests per minute
- **Debug Endpoints**: 20 requests per minute

## Error Handling

### Real-time Stats
- **AbortController**: Cancels pending requests on component unmount
- **Partial Failures**: Silently handled, returns available data
- **Network Errors**: Logged but don't break the UI

### Cron Updates
- **Retry Logic**: None (relies on next scheduled run)
- **Partial Success**: Continues with next genre on failure
- **NG Filtering**: Applied during fetch to ensure clean data

## Performance Optimizations

1. **Visible Items Only**: Updates only the first 50 items shown
2. **Batch Processing**: Groups 10 videos per Snapshot API call
3. **Debouncing**: 3-minute interval prevents excessive updates
4. **Progressive Enhancement**: Stats update without UI re-renders
5. **Memory Management**: Uses refs to track abort controllers

## API Usage Summary

### Daily Snapshot API Calls
- **Cron Job**: ~165,600 calls/day
- **User Sessions**: Variable (2,400 calls/day per active user)
- **Total Estimate**: 200,000+ calls/day with moderate traffic

### Bandwidth Considerations
- **Compressed Storage**: Cloudflare KV uses gzip compression
- **Minimal Payloads**: Only fetches required fields
- **Efficient Queries**: Uses contentId for precise lookups

## Recommendations

1. **Consider Caching Stats**: Add 1-5 minute cache for video stats
2. **Reduce Update Frequency**: Increase to 5-10 minutes for less critical views
3. **Implement Request Pooling**: Share stats updates between users
4. **Add Circuit Breaker**: Prevent cascade failures during API outages
5. **Monitor API Limits**: Track usage against Niconico's rate limits