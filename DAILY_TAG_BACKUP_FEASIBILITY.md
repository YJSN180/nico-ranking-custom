# Daily Popular Tag Backup Feasibility Analysis

## Executive Summary

**✅ Storing daily popular tag backups in Vercel KV is FEASIBLE even on the Free tier**

The additional storage and command requirements are minimal compared to current usage, making this feature safe to implement without upgrading to Pro tier.

## Current Storage Usage

### Main Ranking Data
- **Cached Genres**: 7 (all, game, entertainment, other, technology, anime, voicesynthesis)
- **Periods**: 2 (24h, hour)
- **Items**: 7 × 2 × 300 = 4,200 items
- **Storage**: ~2.0MB

### Tag Ranking Data (Other Genre)
- **Pre-cached Tags**: ~15 popular tags
- **Items per Tag**: 300
- **Total Items**: 4,500
- **Storage**: ~2.1MB

### Total Current Usage
- **Items**: ~8,700
- **Storage**: ~4.2MB (1.6% of Free tier limit)

## Proposed Daily Backup Requirements

### Data Structure
```typescript
{
  key: `popular-tags-backup-${YYYY-MM-DD}`,
  value: {
    date: '2024-01-01',
    genres: {
      all: ['tag1', 'tag2', ...],
      game: ['tag1', 'tag2', ...],
      // ... all 23 genres
    }
  },
  ttl: 31 days // Auto-deletion
}
```

### Storage Calculation
- **Genres**: 23
- **Tags per Genre**: ~10
- **Bytes per Tag**: ~50 (average tag name length)
- **Days to Keep**: 30
- **Total Backup Storage**: ~0.3MB

### Command Usage
- **Daily Writes**: 23 (one per genre during cron job)
- **Estimated Daily Reads**: 50 (admin panel, analysis)
- **Total Additional Commands**: ~73/day

## Vercel KV Limits Comparison

### Free Tier (256MB storage, 3K daily commands)
- **Storage After Backup**: 4.5MB (1.8% of limit) ✅
- **Daily Commands**: ~573 (19% of limit) ✅
- **Verdict**: Safe to implement

### Pro Tier (1GB storage, 100K daily commands)
- **Storage After Backup**: 4.5MB (0.4% of limit) ✅
- **Daily Commands**: ~573 (0.6% of limit) ✅
- **Verdict**: Massive headroom

## Alternative Approaches

### 1. Compressed Single Entry
Store all genres in one JSON blob per day
- **Pros**: Fewer KV entries, simpler management
- **Cons**: No partial updates, larger parse overhead

### 2. Weekly Summaries
Store weekly instead of daily snapshots
- **Pros**: 1/7 storage usage, good for trends
- **Cons**: Loss of daily granularity

### 3. Top Tags Only
Store only top 5 tags per genre
- **Pros**: 50% storage reduction
- **Cons**: Incomplete historical data

### 4. External Storage
Move old data to Supabase/S3
- **Pros**: Unlimited history, KV stays light
- **Cons**: Additional cost and complexity

## Implementation Recommendation

### Recommended Approach
Use the compressed single entry approach with TTL:
1. Single KV entry per day containing all genres
2. 31-day TTL for automatic cleanup
3. Efficient storage (~11KB per day)
4. Simple retrieval and management

### Implementation Steps
1. Add backup logic to existing cron job (`/api/cron/fetch`)
2. Collect popular tags during ranking updates
3. Store as single dated entry with TTL
4. Create admin interface for viewing history

### Code Example
```typescript
// In cron job after ranking updates
const backupKey = `popular-tags-backup-${new Date().toISOString().split('T')[0]}`
const backupData = {
  date: new Date().toISOString(),
  genres: collectedPopularTags // { all: [...], game: [...], ... }
}
await kv.set(backupKey, backupData, { ex: 31 * 24 * 60 * 60 }) // 31 days TTL
```

## Conclusion

The daily popular tag backup feature is well within Vercel KV's capabilities on the Free tier. The minimal storage footprint (0.3MB) and low command usage (73/day) make this a safe and valuable addition to the system without requiring any infrastructure upgrades.