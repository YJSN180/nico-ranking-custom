# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Start Next.js development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
```

### Testing
```bash
npm test             # Run Vitest unit/integration tests (watch mode)
npm test -- --run    # Run tests once without watch mode
npm run test:coverage # Run tests with coverage (90% threshold required)
npm run test:e2e     # Run Playwright E2E tests
npm run test:all     # Run all tests sequentially
npm run check:all    # Full CI check (typecheck + lint + test + build)
```

To run a single test file:
```bash
npx vitest run path/to/test.ts
```

## Architecture

### Data Flow
1. **Cron Job** (`/api/cron/fetch`) runs every 10 minutes
   - Fetches ranking data for 9 genres × 2 periods (24h/hour) = 18 datasets
   - Uses hybrid scraping: HTML parsing + Snapshot API + Tag extraction
   - Googlebot User-Agent bypasses geo-blocking
   - Stores in Vercel KV with keys `ranking-{genre}-{period}` (1h TTL)
   - Supports both sensitive and non-sensitive video content

2. **API Route** (`/api/ranking`) serves cached data
   - Reads from KV using period-specific cache keys
   - Falls back to on-demand scraping if cache miss
   - Returns 30s cache headers for browser caching

3. **Homepage** (`/app/page.tsx`) displays rankings
   - Direct KV access in Server Component (primary)
   - Falls back to API fetch if KV fails
   - ISR with 30s revalidation

4. **Real-time Updates** (`useRealtimeStats` hook)
   - Client-side hook updates video statistics every minute
   - Uses Snapshot API for live view/comment/mylist counts
   - Non-blocking updates preserve UI responsiveness

### Multi-Period Support
The system caches both 24-hour and hourly rankings:
- Cache keys: `ranking-{genre}-24h` and `ranking-{genre}-hour`
- Backward compatibility maintained with `ranking-{genre}` keys
- Client-side period switching triggers new API calls

### Scraping Architecture
The hybrid scraper (`complete-hybrid-scraper.ts`) combines:
- **HTML Parsing**: Genre-specific ranking pages with meta tag extraction
- **Tag Enrichment**: Individual video page scraping for tag data
- **Popular Tags**: Server-response JSON extraction for trending tags
- **Geo-blocking Bypass**: Googlebot User-Agent for all requests

### Key Technical Constraints

1. **Geo-blocking**: Nico Nico returns 403 from non-Japanese IPs. Googlebot UA bypass is essential for all ranking requests.

2. **KV Cache Strategy**: 
   ```typescript
   // New format (current)
   ranking-${genre}-${period}: { items: RankingData, popularTags: string[] }
   
   // Legacy format (backward compatibility)
   ranking-${genre}: { items: RankingData, popularTags: string[] }
   ranking-data: RankingData (for 'all' genre only)
   ```

3. **Environment Variables**:
   - `KV_REST_API_URL` & `KV_REST_API_TOKEN` - Required for Vercel KV
   - `CRON_SECRET` - Required for cron authentication
   - `VERCEL_URL` - Auto-set by Vercel, used for server-side API calls

4. **TypeScript Strict Mode**: Project uses strict TypeScript with `noUncheckedIndexedAccess`. Always handle potential undefined values when accessing arrays/objects.

5. **Runtime Constraints**: 
   - Cron jobs use Node.js runtime for scraping capabilities
   - API routes use Node.js runtime (changed from Edge for compatibility)

## Genre and Period Management

### Supported Genres
**事前キャッシュされるジャンル（7個）:**
```typescript
const CACHED_GENRES = ['all', 'game', 'entertainment', 'other', 'technology', 'anime', 'voicesynthesis']
```

**全ジャンル（オンデマンド対応）:**
すべての`RankingGenre`型で定義されたジャンルがAPIで利用可能。キャッシュされていないジャンルはオンデマンドで取得。

### Period Types
- `'24h'` - 24-hour ranking (default)
- `'hour'` - Hourly ranking

### Tag Support
- Popular tags extracted from server response data
- Tag-filtered rankings are fetched on-demand (not pre-cached)
- **Important**: Nico Nico's tag-filtered rankings don't support pagination beyond 100 items
- All tag rankings are limited to 100 items maximum due to platform limitations

## Testing Philosophy

This project follows strict TDD with 90% coverage requirement. When adding features:
1. Write failing tests first
2. Implement minimal code to pass
3. Refactor while keeping tests green

Tests are organized by type:
- `__tests__/unit/` - Component and utility tests
- `__tests__/integration/` - API and data flow tests
- `__tests__/e2e/` - Full user journey tests

## Common Pitfalls

1. **Console Statements**: ESLint forbids console.log. Remove all console statements before committing.

2. **Server Component Data Fetching**: Don't use client-side environment variables (`NEXT_PUBLIC_*`) in server components. Use `VERCEL_URL` for server-side API calls.

3. **Build Errors**: Local builds may fail with SIGBUS. Always let Vercel handle production builds.

4. **Ranking Data Structure**: Always expect this format:
   ```typescript
   type RankingItem = {
     rank: number
     id: string
     title: string
     thumbURL: string
     views: number
     comments?: number
     mylists?: number
     likes?: number
     tags?: string[]
     authorId?: string
     authorName?: string
     authorIcon?: string
     registeredAt?: string // ISO 8601形式の投稿日時
   }
   ```

5. **Rate Limiting**: Scraping includes deliberate delays and batch processing to avoid overwhelming Nico Nico servers.

6. **Cache Key Consistency**: When adding new cache patterns, maintain backward compatibility and include period information in keys.

7. **Period Switching Fix**: The `client-page.tsx` component now uses `useRef` instead of comparing against initial props to properly track configuration changes. This fixes the issue where switching from 24h → hourly → 24h would not update the data on the final switch.

8. **Tag Ranking Dynamic Loading**: Tag-filtered rankings use dynamic loading (100 items per page) instead of pre-fetching 300 items. This conserves KV storage and improves initial load time. The state is preserved in sessionStorage for browser back button support.

9. **NG Filtering for Tag Rankings**: Tag rankings apply NG filtering at display time (runtime) since they are fetched on-demand. The `ng-filter.ts` module includes memory caching (1 minute) and Set-based O(1) lookups for performance.