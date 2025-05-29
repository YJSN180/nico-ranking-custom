# Hybrid Scraping Implementation for Sensitive Videos

## Overview
This document describes the implementation of a hybrid scraping approach to include sensitive/device-restricted videos in Niconico rankings, which are filtered out by the nvapi but appear in web pages.

## Problem
- nvapi (`https://nvapi.nicovideo.jp/v1/ranking/genre/{genre}`) filters out sensitive videos
- RSS feed includes all videos but will be deprecated
- Examples of missing videos:
  - 4th place: "機動戦士Gundam G糞uuuuuuX(ジークソクス)OP Ksodva" (sm44197856)
  - 5th place: "静電気ドッキリを仕掛けるタクヤさん" (sm44205605)

## Solution
Implemented a hybrid approach in `/lib/scraper.ts`:

1. **Primary**: Use nvapi for fast, reliable access with rich metadata
2. **Fallback**: When videos are missing, fetch HTML and parse it
3. **Merge**: Combine data maintaining web order with nvapi metadata
4. **Enrich**: Use Snapshot API to get metadata for missing videos

## Implementation Details

### Detection Logic
```typescript
// Trigger web scraping when:
// 1. No tag filter is applied (tag filtering already limits results)
// 2. AND either:
//    - Less than 100 items returned (usual count)
//    - OR genre is "other" (known to have many sensitive videos)
if (!tag && (items.length < 100 || genre === 'other')) {
  // Fallback to web scraping
}
```

### Web Scraping
- Parses HTML using regex for reliability
- Extracts: video ID, title, thumbnail, view count
- Handles HTML entities (`&quot;`, `&amp;`, etc.)

### Data Merging
1. Uses web scraping order (maintains correct ranking)
2. Enriches with nvapi data when available
3. For missing videos, fetches additional metadata via Snapshot API

### Performance Optimizations
- Only triggers for non-tag-filtered rankings
- Caches results in KV store
- Fails gracefully if web scraping errors

## Testing

### Manual Testing
```bash
# Test endpoints available:
curl http://localhost:3000/api/test-scraping/test-hybrid
curl http://localhost:3000/api/test-scraping/compare-sources
```

### Automated Tests
```bash
npm test -- hybrid-scraping.test.ts
```

## Deployment Considerations

1. **Error Handling**: Web scraping failures don't break the service
2. **Performance**: Adds ~200-500ms when fallback is triggered
3. **Monitoring**: Track when fallback is used via logs
4. **HTML Changes**: Regular expressions are resilient but may need updates

## Future Improvements

1. **Caching**: Cache web scraping results separately
2. **Parallel Fetching**: Fetch nvapi and web concurrently
3. **Smart Detection**: Learn patterns of when sensitive videos appear
4. **Alternative APIs**: Explore mobile or app-specific endpoints

## Code Locations

- Main implementation: `/lib/scraper.ts`
- Test scripts: `/app/api/test-scraping/*`
- Unit tests: `/__tests__/unit/hybrid-scraping.test.ts`
- Documentation: `/SENSITIVE_VIDEO_SOLUTION.md`

## Rollback Plan

If issues arise, remove the web scraping logic by commenting out lines 108-121 in `/lib/scraper.ts`. The service will continue working with nvapi data only.