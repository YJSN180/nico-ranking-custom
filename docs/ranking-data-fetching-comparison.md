# Normal vs Tag-based Ranking Data Fetching Comparison

This document provides a detailed comparison between normal ranking and tag-based ranking data fetching patterns in the Nico Ranking system.

## Overview

The system implements two distinct data fetching strategies:
1. **Normal Rankings**: Pre-cached with 300 items (after NG filtering)
2. **Tag Rankings**: Dynamically loaded with 100 items per page

## Data Fetching Patterns

### Normal Rankings

**Pre-caching Strategy**:
- Cron job runs every 30 minutes (via GitHub Actions)
- Fetches 9 genres × 2 periods (24h/hour) = 18 datasets
- Each dataset aims for 300 items after NG filtering
- May fetch up to 5 pages (500 items) to ensure 300 filtered items

**Data Flow**:
```
Cron Job → Scrape Multiple Pages → NG Filter → Store 300 items in KV
   ↓
Client → KV Cache (primary) → Fallback to API → Display
```

**Implementation Details** (from `/app/api/cron/fetch/route.ts`):
```typescript
// Fetch up to 5 pages to ensure 300 items after filtering
const targetCount = 300
const maxPages = 5

while (allItems.length < targetCount && page <= maxPages) {
  const { items: pageItems } = await scrapeRankingPage(genre, period, undefined, 100, page)
  const { items: filtered } = await filterRankingData({ items: pageItems })
  allItems.push(...filtered)
  page++
}

// Store in KV with 1-hour TTL
await kv.set(`ranking-${genre}-${period}`, { items, popularTags }, { ex: 3600 })
```

### Tag Rankings

**Dynamic Loading Strategy**:
- No pre-caching (except top 5 popular tags)
- Fetches 100 items per page on-demand
- Applies NG filtering at runtime
- Supports pagination for loading more

**Data Flow**:
```
Client → API Request (page N) → Scrape Page N → NG Filter → Return 100 items
   ↓
Load More → API Request (page N+1) → Append to existing data
```

**Implementation Details** (from `/app/api/ranking/route.ts`):
```typescript
if (tag) {
  // Tag rankings: ensure 100 items after NG filtering
  const targetCount = 100
  let currentPage = page
  const maxAttempts = 3
  
  while (allItems.length < targetCount && currentPage < page + maxAttempts) {
    const { items: pageItems } = await scrapeRankingPage(genre, period, tag, 100, currentPage)
    const { items: filtered } = await filterRankingData({ items: mappedItems })
    allItems.push(...filtered)
    currentPage++
  }
  
  // Trim to 100 items and reassign ranks
  allItems = allItems.slice(0, targetCount).map((item, index) => ({
    ...item,
    rank: (page - 1) * targetCount + index + 1
  }))
}
```

## Caching Strategies

### Normal Rankings

**Cache Keys**:
```
ranking-${genre}-${period}          // e.g., ranking-game-24h
ranking-${genre}                    // Legacy format (backward compatibility)
ranking-data                        // Special case for 'all' genre
```

**Cache Characteristics**:
- TTL: 1 hour (3600 seconds)
- Size: ~300 items per cache entry
- Pre-generated for all genre/period combinations
- Includes popular tags in cache

### Tag Rankings

**Cache Keys**:
```
ranking-${genre}-${period}-tag-${tag}        // Page 1
ranking-${genre}-${period}-tag-${tag}-page2  // Page 2+
```

**Cache Characteristics**:
- TTL: 1 hour (3600 seconds)
- Size: ~100 items per cache entry
- Generated on-demand only
- Only top 5 popular tags pre-cached
- Page-specific caching for pagination

## Performance Implications

### Normal Rankings

**Advantages**:
- Fast initial load (data already in cache)
- No API calls needed for first 300 items
- Predictable performance
- Lower server load during user requests

**Disadvantages**:
- Higher KV storage usage (300 items × 18 combinations)
- Longer cron job execution time
- Stale data between updates (max 30 minutes)
- More API calls to Nico Nico during cron

### Tag Rankings

**Advantages**:
- Lower KV storage usage (only cached when accessed)
- Always fresh data (on-demand fetching)
- Flexible - can handle any tag combination
- Progressive loading improves perceived performance

**Disadvantages**:
- Slower initial load (requires API call)
- Higher latency for first request
- More complex client-side state management
- Potential for rate limiting with many users

## Resource Usage Differences

### KV Storage

**Normal Rankings**:
```
18 datasets × 300 items × ~1KB per item = ~5.4MB base storage
+ Popular tag pre-caching (5 tags × 9 genres) = additional ~1.35MB
Total: ~6.75MB
```

**Tag Rankings**:
```
Only stored when accessed
Average: 10-20 active tag combinations × 100 items × ~1KB = ~1-2MB
Maximum (theoretical): Unlimited, but with 1-hour TTL
```

### API Calls to Nico Nico

**Normal Rankings**:
```
Cron job: Up to 5 pages × 18 datasets = 90 requests per 30 minutes
User requests: 0 (served from cache)
```

**Tag Rankings**:
```
Cron job: 0
User requests: 1-3 requests per user per tag (depending on NG filtering)
```

## Client-Side Implementation

### State Management (from `/app/client-page.tsx`)

**Normal Rankings**:
```typescript
const [displayCount, setDisplayCount] = useState(100)
const [hasMore, setHasMore] = useState(initialData.length > 100)

// Simple pagination from pre-loaded data
const displayItems = filteredItems.slice(0, displayCount)
```

**Tag Rankings**:
```typescript
const [currentPage, setCurrentPage] = useState(1)
const [hasMore, setHasMore] = useState(initialData.length === 100)

// Complex state with dynamic loading
const loadMoreItems = async () => {
  const response = await fetch(`/api/ranking?page=${currentPage + 1}`)
  const newData = await response.json()
  setRankingData([...rankingData, ...newData])
  setCurrentPage(currentPage + 1)
}
```

### Session Storage

Both types use session storage for browser back button support:
```typescript
const storageKey = `ranking-state-${genre}-${period}-${tag || 'none'}`
sessionStorage.setItem(storageKey, JSON.stringify({
  items: rankingData,
  displayCount,
  currentPage,
  hasMore,
  scrollPosition
}))
```

## NG Filtering Differences

### Normal Rankings
- NG filtering applied during cron job
- Users receive pre-filtered data
- Consistent filtering across all users
- Additional runtime filtering for custom user NG lists

### Tag Rankings
- NG filtering applied at request time
- May fetch additional pages to ensure 100 items
- More computational overhead per request
- Same runtime filtering for custom user NG lists

## Recommendations

1. **For Popular Content**: Continue using pre-cached normal rankings
2. **For Long Tail**: Tag rankings with dynamic loading are more efficient
3. **Consider Hybrid**: Pre-cache top 10-20 tags instead of just 5
4. **Monitor Usage**: Track which tags are frequently accessed and adjust pre-caching
5. **Optimize NG Filtering**: Consider caching NG filter results for tag rankings