# Solution for Missing Sensitive/Device-Restricted Videos

## Problem Summary
The nvapi ranking endpoint (`https://nvapi.nicovideo.jp/v1/ranking/genre/{genre}`) is missing certain videos that appear in the RSS feed, specifically:
- 4th place: "機動戦士Gundam G糞uuuuuuuX(ジークソクス)OP Ksodva" (sm44197856)
- 5th place: "静電気ドッキリを仕掛けるタクヤさん" (sm44205605)

These videos appear to be filtered out due to being marked as sensitive content or having device restrictions.

## Investigation Results

### 1. **RSS Feed** (Current Implementation)
- ✅ Contains ALL ranking videos including sensitive content
- ❌ Will be deprecated soon
- URL: `https://www.nicovideo.jp/ranking/genre/{genre}?term={term}&rss=2.0&lang=ja-jp`

### 2. **nvapi v1** (Current Scraper)
- ✅ Fast and reliable
- ✅ Rich metadata (comments, likes, tags, author info)
- ❌ Missing sensitive/restricted videos
- ❌ No parameters found to include sensitive content

### 3. **Web Scraping** (HTML Parsing)
- ✅ Contains ALL videos including sensitive content
- ✅ Same data as RSS feed
- ✅ Works with standard HTTP requests
- ❌ More fragile (depends on HTML structure)
- ❌ Slightly slower than API calls

### 4. **Snapshot API v2**
- ✅ Can fetch individual video data
- ✅ Includes sensitive videos when searched directly
- ❌ Not suitable for ranking (no ranking order)
- ❌ Requires complex queries for time-based filtering

### 5. **Authentication/Session Approaches**
- ❌ No working authentication method found
- ❌ Cookies don't affect nvapi results
- ❌ No special headers enable sensitive content

## Recommended Solution: Hybrid Approach

### Primary Strategy: Web Scraping Fallback
1. Try nvapi first (fast, reliable, rich metadata)
2. Compare count with expected (RSS or web scraping)
3. If videos are missing, fetch ranking via web scraping
4. Merge data: use web scraping order with nvapi metadata

### Implementation Steps:

#### 1. Add Web Scraping Function
```typescript
async function scrapeWebRanking(genre: string, term: string) {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  // Parse HTML and extract video data
}
```

#### 2. Modify Scraper to Use Hybrid Approach
```typescript
export async function scrapeRankingPage(genre: string, term: string) {
  // Get nvapi data
  const nvapiData = await fetchNvapi(genre, term)
  
  // Check if sensitive videos might be missing
  if (genre === 'all' && !tag) {
    const webData = await scrapeWebRanking(genre, term)
    return mergeRankingData(webData, nvapiData)
  }
  
  return nvapiData
}
```

#### 3. Enrich Missing Videos
For videos found in web scraping but not in nvapi:
- Use Snapshot API to get metadata
- Or fetch individual video details via nvapi

### Alternative: Monitor and Adapt
1. Continue using RSS until officially deprecated
2. Implement web scraping as ready fallback
3. Switch when RSS stops working

## Test Endpoints Created

1. `/api/test-scraping/compare-sources` - Compares RSS, nvapi, and identifies missing videos
2. `/api/test-scraping/api-exploration` - Tests various API endpoints and parameters
3. `/api/test-scraping/auth-test` - Tests authentication approaches
4. `/api/test-scraping/snapshot-api` - Tests Snapshot API v2 capabilities
5. `/api/test-scraping/web-scrape` - Tests HTML web scraping
6. `/api/test-scraping/undocumented-api` - Explores undocumented endpoints
7. `/api/test-scraping/test-hybrid` - Tests hybrid approach effectiveness
8. `/api/test-scraping/run-all` - Runs all tests and provides summary

## Key Findings

1. **Sensitive Content Filtering**: nvapi deliberately filters out videos marked as sensitive or requiring authentication
2. **No API Workaround**: No parameters, headers, or authentication methods enable sensitive content in nvapi
3. **Web Scraping Works**: HTML contains all videos, same as RSS feed
4. **Individual Access**: Sensitive videos can be fetched individually via nvapi/Snapshot API

## Implementation Priority

1. **High Priority**: Implement web scraping fallback for when nvapi returns incomplete data
2. **Medium Priority**: Add monitoring to detect when RSS is deprecated
3. **Low Priority**: Optimize by caching web scraping results separately

## Code Location
- Hybrid scraper implementation: `/lib/hybrid-scraper.ts`
- Test scripts: `/app/api/test-scraping/`
- Current scraper to modify: `/lib/scraper.ts`