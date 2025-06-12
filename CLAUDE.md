# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

role:あなたは天才プログラマーであり、コーディングに関するすべての問題を完璧に解決します。

## 🚨 CRITICAL SECURITY RULES - APIトークンの取り扱い（絶対厳守）

### APIトークンを絶対にコミットしないでください！

1. **APIトークンは以下の場所にのみ設定**：
   - `.env.local` ファイル（ローカル開発用、gitignore済み）
   - Vercelダッシュボードの環境変数
   - GitHub Secretsの環境変数

2. **絶対にやってはいけないこと**：
   - ❌ コード内にハードコード
   - ❌ ドキュメントに記載
   - ❌ コミットメッセージに含める
   - ❌ スクリプトファイルに直接記載
   - ❌ テストファイルに記載
   - ❌ READMEやマークダウンファイルに記載
   - ❌ .mdファイルへの記載（すべての.mdファイルはgitignoreに追加済み）

3. **正しい使用方法**：
   ```typescript
   // ✅ 正しい
   const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN
   
   // ❌ 絶対禁止 - トークンを直接記載しない
   const apiToken = "実際のトークン"
   ```

4. **もし露出した場合の対応**：
   - 即座にCloudflareダッシュボードでトークンをロール（更新）
   - 新しいトークンを環境変数に設定
   - 古いトークンは自動的に無効化される

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
   - Stores in Cloudflare KV with keys `ranking-{genre}-{period}` (1h TTL)
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
   - `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
   - `CLOUDFLARE_KV_NAMESPACE_ID` - KV namespace ID
   - `CLOUDFLARE_KV_API_TOKEN` - **絶対にコミットしない！環境変数でのみ管理**
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
- **「その他」ジャンルの人気タグ**: 事前キャッシュ（最初の300件）
- **他のジャンルのタグ**: 動的取得のみ
- タグ別ランキングも最大500件まで取得可能（ページネーション対応）
- キャッシュキー: `ranking-${genre}-${period}-tag-${tag}`（300件の配列）

## Testing Philosophy

This project follows strict Test-Driven Development (TDD) principles. **Always write tests before implementing features.**

### TDD Process:
1. **Red**: Write a failing test that defines the desired behavior
2. **Green**: Write the minimal code to make the test pass
3. **Refactor**: Improve the code while keeping tests green

### TDD Best Practices:
- **Test First**: Never write production code without a failing test
- **One Test at a Time**: Write one test, make it pass, then write the next
- **Minimal Implementation**: Write only enough code to make the test pass
- **Refactor with Confidence**: Clean up code after tests are green
- **Test Behavior, Not Implementation**: Focus on what the code does, not how

### Coverage Requirements:
- Current threshold: 42% (temporarily lowered from 90% during refactoring)
- Goal: Return to 90% coverage across all metrics
- Run `npm run test:coverage` to check coverage

### Test Organization:
- `__tests__/unit/` - Component and utility tests
- `__tests__/integration/` - API and data flow tests
- `__tests__/e2e/` - Full user journey tests (Playwright)

### Running Tests:
```bash
npm test                    # Watch mode
npm test -- --run          # Single run
npm run test:coverage      # With coverage report
npx vitest run <file>      # Run specific test file
```

### Example TDD Workflow:
```bash
# 1. Create a test file
touch __tests__/unit/new-feature.test.tsx

# 2. Write a failing test
# 3. Run the test to see it fail
npx vitest run __tests__/unit/new-feature.test.tsx

# 4. Implement the feature
# 5. Run the test again to see it pass
# 6. Refactor if needed
# 7. Run all tests to ensure nothing broke
npm test -- --run
```

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

10. **Popular Tags Backup System**: 4-hour interval backup (0:00, 4:00, 8:00, 12:00, 16:00, 20:00) for popular tags to prevent display issues. Backup keys: `popular-tags-backup:YYYY-MM-DD:HH`

11. **Mobile UI Improvements**: 
    - Horizontal scroll for genre/tag selection
    - Dynamic popular tag updates on genre/period change
    - Adjusted header layout to prevent title overlap

12. **NG List Rank Reordering**: When videos are blocked via NG list, ranks are properly reordered to maintain continuous numbering.

13. **Theme System**: The application supports three themes (light, dark, dark blue) with CSS variables. Theme preference is stored in localStorage and applied instantly without flash.

14. **Hybrid Pagination**: URL parameters track display count (`?show=300`). Browser back button preserves state. Maximum 500 items supported with automatic restoration.

15. **Scroll Restoration**: Custom scroll restoration with `history.scrollRestoration = 'manual'` to prevent conflicts with browser defaults.

## GitHub Access

### Repository Information
- Repository: `YJSN180/nico-ranking-custom`
- Main branch: `main`
- PR workflow: Create feature branches, submit PRs, merge after CI passes

### GitHub Authentication
When working with GitHub CLI, ensure the correct account is active:
```bash
# Check current authentication status
gh auth status

# Switch to YJSN180 account if needed
gh auth switch -u YJSN180

# If authentication fails, re-login
gh auth login
```

### GitHub CLI Commands
```bash
# View PR status
gh pr view <PR_NUMBER> --json state,statusCheckRollup,mergeable

# Create new PR
gh pr create --title "Title" --body "Description"

# Merge PR (after all checks pass)
gh pr merge <PR_NUMBER> --squash --delete-branch

# Check workflow runs
gh run list
gh run view <RUN_ID>

# View specific job logs
gh run view <RUN_ID> --log
gh run view <RUN_ID> --log-failed
```

### Working with Branches
```bash
# Create and checkout new feature branch
git checkout -b feat/feature-name

# Push branch to remote
git push -u origin feat/feature-name

# Delete local branch after merge
git branch -D feat/feature-name

# Clean up remote tracking branches
git remote prune origin
```

### CI/CD Pipeline
1. **On Push/PR**:
   - Security checks
   - Unit/Integration tests (Vitest)
   - TypeScript type checking
   - ESLint
   - Build verification
   - CodeQL analysis

2. **On Schedule**:
   - Update Nico Ranking Data (every 10 minutes)
   - Fetches and caches ranking data for all genres/periods

### Deployment
- Automatic deployment to Vercel on push to `main`
- Preview deployments for all PRs
- Environment variables managed in Vercel dashboard

## Documentation Management Policy

### File Commitment Rules

**Files that CAN be committed (allowlist):**
- `README.md` - Project overview and setup instructions
- `CLAUDE.md` - This instruction file for AI assistants
- Source code files (`.ts`, `.tsx`, `.js`, `.jsx`, `.css`, etc.)
- Configuration files (`package.json`, `tsconfig.json`, `.eslintrc`, etc.)
- Test files (`*.test.ts`, `*.spec.ts`)
- Build configuration (`next.config.js`, `playwright.config.ts`, etc.)
- CI/CD configuration (`.github/workflows/`, `vercel.json`)

**Files that must be gitignored (blocklist):**
- All other `.md` files (documentation, notes, guides, etc.)
- Documentation directories (`docs/`, `documentation/`, `doc/`)
- Alternative documentation formats (`.rst`, `.txt`, `.adoc`, `.markdown`, etc.)
- Temporary files (`.tmp`, `.bak`, `.log`)
- Environment files (`.env*`)
- Generated files (build outputs, coverage reports)
- Tool-specific files (`.tools/`, `.claude/`, `.wrangler/`)

### Documentation Creation Guidelines

1. **Never create documentation files automatically** - Only create when explicitly requested
2. **Use appropriate gitignore patterns** - Ensure new documentation types are properly excluded
3. **Maintain clean repository** - Keep only essential files in version control
4. **Security first** - Never commit sensitive information in any documentation

## Multi-Agent Task Management

### When to Use Multiple Sub-Agents

Use multiple sub-agents for complex tasks that involve:

1. **Parallel Processing Requirements**:
   - Multiple independent API calls
   - Concurrent file operations
   - Simultaneous test runs across different modules

2. **Specialized Domain Knowledge**:
   - Frontend UI components + Backend API logic
   - Testing strategy + Implementation
   - Security analysis + Performance optimization

3. **Large-Scale Refactoring**:
   - Database schema changes + API updates + Frontend adjustments
   - Multi-service deployments
   - Cross-cutting architectural changes

### Sub-Agent Coordination Guidelines

1. **Clear Task Boundaries**:
   - Define specific responsibilities for each sub-agent
   - Avoid overlapping work areas
   - Establish clear handoff points

2. **Data Sharing Protocols**:
   - Use shared context for common information
   - Pass results between agents efficiently
   - Maintain consistency across all sub-tasks

3. **Error Handling Strategy**:
   - Each sub-agent handles its own domain errors
   - Escalate cross-domain issues to main agent
   - Implement rollback mechanisms for failed multi-agent operations

4. **Progress Tracking**:
   - Maintain overall task progress visibility
   - Report sub-agent completion status
   - Provide unified status updates to users

### Example Multi-Agent Scenarios

**Scenario 1: Full-Stack Feature Implementation**
- Agent A: Database schema and API endpoints
- Agent B: Frontend components and state management
- Agent C: Test suite creation and validation

**Scenario 2: Security Audit and Remediation**
- Agent A: Vulnerability scanning and analysis
- Agent B: Code fixes and security hardening
- Agent C: Testing and deployment verification

**Scenario 3: Performance Optimization**
- Agent A: Backend optimization (caching, queries)
- Agent B: Frontend optimization (bundling, lazy loading)
- Agent C: Infrastructure tuning (CDN, server config)