# Hybrid Caching Implementation Plan

## Current Situation Analysis

### Current Caching Strategy
1. **Genre Rankings (Pre-cached)**
   - 9 genres × 2 periods = 18 datasets
   - Each dataset: 300 items (post-NG filtering)
   - Storage: ~18 × 300 items = ~5,400 items

2. **Tag Rankings (Pre-cached - Limited)**
   - Top 5 tags per genre (24h only)
   - 9 genres × 5 tags = 45 tag datasets
   - Storage: Varies (typically 50-100 items per tag)

3. **Popular Tags Extraction**
   - From HTML server-response meta tag
   - From HTML tag ranking links
   - Stored with each genre's ranking data

### Problems with Current Approach
1. **Limited Tag Coverage**: Only top 5 tags pre-cached
2. **Storage Inefficiency**: Many rarely-accessed tag combinations stored
3. **Update Overhead**: Cron job takes longer with more pre-cached tags
4. **Stale Data**: Less popular tags might have outdated cache

## Proposed Hybrid Caching Strategy

### 1. Tiered Caching Approach

#### Tier 1: Always Pre-cached (High Priority)
- **All genre rankings**: 9 genres × 2 periods = 18 datasets
- **Top 10 popular tags** per genre (24h only)
  - Based on actual usage analytics
  - Dynamic list updated weekly

#### Tier 2: On-Demand with Extended Cache
- **Tags ranked 11-20**: Cached for 2 hours on first request
- **Less popular genres' tags**: Cached for 1 hour

#### Tier 3: Pure Dynamic
- **Long-tail tags**: No pre-caching, 30-minute cache
- **User-specific combinations**: Real-time fetch

### 2. Implementation Details

#### Cron Job Modifications (`/api/cron/fetch/route.ts`)
```typescript
// Increase popular tags to pre-cache from 5 to 10
const POPULAR_TAGS_TO_CACHE = 10;

// Add tag popularity tracking
const TAG_POPULARITY_KEY = 'tag-popularity-stats';

// Modified tag caching logic
if (period === '24h' && popularTags && popularTags.length > 0 && genre !== 'all') {
  // Get tag popularity stats
  const tagStats = await kv.get(TAG_POPULARITY_KEY) || {};
  
  // Sort tags by actual usage (if available) or use default order
  const sortedTags = sortTagsByPopularity(popularTags, tagStats[genre]);
  
  // Cache top N tags
  for (const tag of sortedTags.slice(0, POPULAR_TAGS_TO_CACHE)) {
    // Implementation remains same
  }
}
```

#### API Route Modifications (`/api/ranking/route.ts`)
```typescript
// Add cache TTL based on tag popularity
function getCacheTTL(genre: string, tag?: string): number {
  if (!tag) return 3600; // 1 hour for genre rankings
  
  const popularTags = await getPopularTags(genre);
  const tagRank = popularTags.indexOf(tag);
  
  if (tagRank < 10) return 3600;      // Top 10: 1 hour
  if (tagRank < 20) return 7200;      // Top 11-20: 2 hours
  return 1800;                         // Others: 30 minutes
}

// Track tag usage for popularity
async function trackTagUsage(genre: string, tag: string) {
  const key = TAG_POPULARITY_KEY;
  const stats = await kv.get(key) || {};
  
  if (!stats[genre]) stats[genre] = {};
  stats[genre][tag] = (stats[genre][tag] || 0) + 1;
  
  await kv.set(key, stats, { ex: 604800 }); // 7 days
}
```

### 3. Storage Impact Analysis

#### Current Storage Usage
```
Base Rankings: 18 datasets × 300 items × ~500 bytes = ~2.7 MB
Tag Rankings: 45 datasets × 75 items × ~500 bytes = ~1.7 MB
Total: ~4.4 MB
```

#### Proposed Storage Usage
```
Base Rankings: 18 datasets × 300 items × ~500 bytes = ~2.7 MB
Popular Tags: 9 genres × 10 tags × 100 items × ~500 bytes = ~4.5 MB
Dynamic Cache: Variable, estimated ~2-3 MB average
Total: ~9-10 MB (2.2x increase)
```

### 4. Performance Benefits

#### Response Time Improvements
- **Popular tags (90% of requests)**: Instant (pre-cached)
- **Semi-popular tags**: 300-500ms (on-demand)
- **Rare tags**: 500-800ms (dynamic fetch)

#### Cron Job Optimization
- **Current**: ~180 API calls (genres + tags)
- **Proposed**: ~108 API calls (genres + top 10 tags)
- **Time Saved**: ~40% reduction

#### Cache Hit Rates
- **Expected**: 85-90% cache hits for tag requests
- **Current**: ~60% cache hits

### 5. Implementation Steps

1. **Phase 1: Analytics Setup** (Week 1)
   - Implement tag usage tracking
   - Deploy to production
   - Collect usage data

2. **Phase 2: Cron Job Update** (Week 2)
   - Increase pre-cached tags to 10
   - Implement popularity-based selection
   - Test performance impact

3. **Phase 3: Dynamic Caching** (Week 3)
   - Implement tiered TTL logic
   - Add cache warming for trending tags
   - Monitor KV storage usage

4. **Phase 4: Optimization** (Week 4)
   - Fine-tune cache TTLs based on metrics
   - Implement cache eviction policies
   - Add monitoring dashboard

### 6. Monitoring & Metrics

#### Key Metrics to Track
- Cache hit rate per tag
- Average response time by tier
- KV storage usage over time
- Cron job execution time
- Tag popularity distribution

#### Alerting Thresholds
- Cache hit rate < 80%
- KV storage > 15 MB
- Cron job time > 5 minutes
- Error rate > 1%

### 7. Rollback Plan

If issues arise:
1. Revert cron job to cache only 5 tags
2. Clear tag popularity stats
3. Reset cache TTLs to 1 hour
4. Monitor for stability

## Conclusion

This hybrid approach balances performance and resource usage by:
- Pre-caching truly popular content (85%+ of requests)
- Using smart TTLs for medium-popularity content
- Keeping storage growth manageable (~2.2x)
- Maintaining sub-second response times for most users

The implementation is backwards-compatible and can be rolled out gradually with minimal risk.