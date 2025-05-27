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
1. **Cron Job** (`/api/cron/fetch`) runs hourly
   - Fetches RSS from `https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp`
   - Uses Googlebot User-Agent to bypass geo-blocking
   - Falls back to mock data on errors
   - Stores in Vercel KV with key `ranking-data` (1h TTL)

2. **API Route** (`/api/ranking`) serves data from KV
   - Handles both string and object responses from KV
   - Returns 30s cache headers

3. **Homepage** (`/app/page.tsx`) displays rankings
   - Direct KV access in Server Component (primary)
   - Falls back to API fetch if KV fails
   - ISR with 30s revalidation

### Key Technical Constraints

1. **Geo-blocking**: Nico Nico RSS returns 403 from non-Japanese IPs. Current solution uses mock data fallback. Future solution requires proxy server.

2. **Vercel KV Data Format**: The API must handle both string and pre-parsed object responses:
   ```typescript
   if (typeof data === 'object' && Array.isArray(data)) {
     return data as RankingData
   } else if (typeof data === 'string') {
     return JSON.parse(data)
   }
   ```

3. **Environment Variables**:
   - `KV_REST_API_URL` & `KV_REST_API_TOKEN` - Required for Vercel KV
   - `CRON_SECRET` - Required for cron authentication
   - `VERCEL_URL` - Auto-set by Vercel, used for server-side API calls

4. **TypeScript Strict Mode**: Project uses strict TypeScript with `noUncheckedIndexedAccess`. Always handle potential undefined values when accessing arrays/objects.

5. **Edge Runtime**: API routes use Edge Runtime for performance. Ensure compatibility when adding dependencies.

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
   }
   ```