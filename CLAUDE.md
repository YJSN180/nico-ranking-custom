# CLAUDE.md

Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイドライン。

役割：天才プログラマーとしてコーディングに関するすべての問題を完璧に解決する。

## 🔒 誠実性の原則
- **確認せずに推測で回答しない**: 実際にコードやログを確認してから回答する
- **不確実な場合は素直に認める**: 「確認します」「調査が必要です」と正直に伝える
- **間違いを認める**: エラーや誤解があった場合は即座に訂正し謝罪する

## 🚨 CRITICAL SECURITY RULES - 環境変数とAPIトークンの管理（絶対厳守）

### 🔥 絶対厳守事項 - 機密情報の露出防止

**過去の重大インシデント**：
- `wrangler.toml`にWORKER_AUTH_KEYをハードコードしてGitHubに露出させた
- ユーザーから「絶対するな」と警告されていたにも関わらず実行した

**二度と繰り返さないための鉄則**：
1. **wrangler.tomlに機密情報を書かない** - 例えテンプレートでも実際の値は禁止
2. **必ず`wrangler secret`コマンドを使用** - シークレット管理の基本
3. **コミット前に必ず確認** - `git diff`で機密情報がないか確認
4. **認証関連の問題は最小限の修正で対応** - 不要な「最適化」は行わない

### 環境変数管理の鉄則

**絶対にコミットしてはいけないファイル**：
- `.env.local` - ローカル開発環境用（.gitignoreで除外済み）
- `.env` - 本番環境用（.gitignoreで除外済み）
- `.env.production` - 本番環境用（.gitignoreで除外済み）
- その他すべての`.env*`ファイル（.gitignoreで除外済み）

**コミット可能なファイル**：
- `.env.example` - 環境変数のテンプレート（実際の値は含めない）
- `.env.local.example` - ローカル開発用テンプレート（実際の値は含めない）

### APIトークンを絶対にコミットしないでください！

1. **APIトークンの正しい設定場所**：
   - `.env.local` ファイル（ローカル開発用、**gitignore済み**）
   - Vercelダッシュボードの環境変数
   - GitHub Secretsの環境変数
   - Cloudflare Workersの環境変数

2. **絶対にやってはいけないこと**：
   - ❌ コード内にハードコード
   - ❌ ドキュメントに記載（.mdファイル含む）
   - ❌ コミットメッセージに含める
   - ❌ スクリプトファイルに直接記載
   - ❌ テストファイルに記載
   - ❌ README.mdに記載
   - ❌ 任意の追跡対象ファイルに記載

3. **正しい使用方法**：
   ```typescript
   // ✅ 正しい - 環境変数から読み取り
   const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN
   
   // ❌ 絶対禁止 - 実際のトークンを直接記載
   const apiToken = "実際のトークン値"
   ```

4. **環境変数の検証**：
   ```typescript
   // ✅ 必須環境変数の検証
   if (!process.env.CLOUDFLARE_KV_API_TOKEN) {
     throw new Error('CLOUDFLARE_KV_API_TOKEN is required')
   }
   ```

5. **もし露出した場合の対応**：
   - **即座に**該当サービスのダッシュボードでトークンをローテーション（更新）
   - 新しいトークンを環境変数に設定
   - 古いトークンは自動的に無効化される
   - コミット履歴から削除（必要に応じて）

### .gitignoreの確認方法

```bash
# 環境変数ファイルが追跡されていないことを確認
git status
git ls-files | grep -E "\.env"

# .env.localが表示されなければ正常
```

## 🏗️ デプロイメントアーキテクチャ

### ハイブリッドデプロイメント戦略

明確な責任分離を持つ**ハイブリッドデプロイメントアーキテクチャ**を採用：

#### 🚀 Vercel (メインアプリケーション)
- **目的**: Next.jsフロントエンドアプリケーションのホスティング
- **ドメイン**: `nico-ranking-custom-yjsns-projects.vercel.app`
- **設定**: `vercel.json`, `next.config.mjs`
- **自動デプロイ**: `main`ブランチへのpush時に実行

#### ⚡ Cloudflare Workers (APIゲートウェイ)
- **目的**: レート制限とDDoS保護を備えたAPIゲートウェイ
- **設定**: `wrangler.toml`, `workers/`ディレクトリ
- **手動デプロイ**: `npm run deploy:worker`
- **ドメイン**: `nico-rank.com/*` (Vercelへプロキシ)

#### 💾 Cloudflare KV (ストレージ)
- **目的**: ランキングデータとレート制限のキャッシュ
- **バインディング**: `RANKING_DATA`, `RATE_LIMIT`
- **更新**: GitHub Actions cronジョブが10分ごとに実行

### ⚠️ 重要: Cloudflare Pages設定

**Cloudflare Pagesはこのプロジェクトをビルドしてはいけないⱘ**

- Vercel用に設計されたNext.jsアプリ
- `.cfignore`ファイルがPagesビルドを防止
- CloudflareにはWorkersのみデプロイ
- メインアプリはVercel経由でデプロイ

#### Cloudflare Pages Build Failures
**Status**: ❌ Expected failures (can be ignored)

The Cloudflare Pages builds will continue to fail because:
1. This project is not designed for Cloudflare Pages
2. The integration was likely set up for Workers but mistakenly includes Pages
3. The failures do NOT affect the main application functionality

**To completely resolve**: 
- Disable Cloudflare Pages integration in the Cloudflare dashboard
- Keep only Cloudflare Workers integration active
- This requires access to the Cloudflare account settings

## コマンド一覧

### 開発
```bash
npm run dev          # Start Next.js development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
```

### テスト
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

## Deployment Management

### 🚀 Deployment Workflow

#### Vercel (Main Application)
- **自動デプロイ**: `main`ブランチへのpush時に自動実行
- **プレビューデプロイ**: PRごとに自動生成
- **環境変数**: Vercelダッシュボードで管理

#### Cloudflare Workers (API Gateway)
- **手動デプロイ**: セキュリティ関連の変更後は必須
- **デプロイコマンド**:
  ```bash
  source .env.local && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy
  ```
- **デプロイが必要な変更**:
  - CSP (Content Security Policy) ヘッダーの修正
  - セキュリティヘッダーの追加・変更
  - レート制限設定の変更
  - ルーティングロジックの変更

#### 🔥 重要：CSP問題のトラブルシューティング

**症状**: ページが一瞬表示された後に真っ白になる、コンソールでCSPエラー
```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' https://*.vercel-scripts.com"
```

**原因**: Next.jsのインラインスクリプトがCSPによってブロックされている

**修正手順**:
1. **next.config.mjs**のCSPを修正:
   ```javascript
   "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com"
   ```

2. **workers/api-gateway-simple.ts**のCSPも同様に修正:
   ```typescript
   "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com"
   ```

3. **変更をコミット・プッシュ**:
   ```bash
   git add .
   git commit -m "fix: add 'unsafe-inline' to CSP for Next.js compatibility"
   git push
   ```

4. **Cloudflare Workersを手動デプロイ**:
   ```bash
   source .env.local && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy
   ```

5. **反映確認**（1-2分後）:
   ```bash
   curl -I https://nico-rank.com/ | grep -i "content-security-policy"
   ```

**注意**: Vercelの自動デプロイだけでは不十分。Cloudflare Workersも手動デプロイが必要。

## Security Configuration

### 🛡️ セキュリティヘッダー実装状況

**実装済みセキュリティヘッダー**:
- ✅ Content-Security-Policy（厳格なCSP）
- ✅ Strict-Transport-Security（HSTS）
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Permissions-Policy（デバイス機能制限）
- ❌ Cross-Origin-Embedder-Policy: 削除済み（ニコニコ動画のサムネイル画像がCORSヘッダーを提供していないため）
- ✅ Cross-Origin-Opener-Policy: same-origin
- ✅ X-DNS-Prefetch-Control: on

**設定場所**:
- `next.config.mjs`: Next.jsアプリケーション用
- `workers/api-gateway-simple.ts`: Cloudflare Workers用

### 🚨 レート制限実装

**多層防御システム**:
1. **Cloudflare Workers（第1防御線）**:
   - Admin API: 20 requests/min
   - 一般API: 50 requests/min
   - ページアクセス: 200 requests/min

2. **Next.js Middleware（第2防御線）**:
   - Admin API: 5 requests/min
   - 一般API: 10 requests/10sec

**セキュリティイベントログ**:
- レート制限超過
- 不正な管理画面ログイン試行
- デバッグエンドポイントへの不正アクセス

### 🔐 認証・認可システム

**管理画面保護**:
- Basic認証（HTTP認証）
- セッション管理（HTTP-only cookie）
- IP別レート制限

**API保護**:
- Worker Auth Key（内部通信）
- Cron Secret（定期実行）
- Preview Protection Key（プレビュー環境）

### ⚙️ Cloudflare設定

**手動設定が必要な項目**（`CLOUDFLARE_SECURITY_SETUP.md`参照）:
- Zone Lockdown（管理画面IP制限）
- Bot Fight Mode
- Firewall Rules
- Advanced Rate Limiting
- DDoS Protection設定

**設定済み項目**:
- SSL/TLS: Full (Strict)
- HSTS有効
- CDN + WAF有効

### 🔍 セキュリティ監視

**ログ記録対象**:
```typescript
// middleware.tsで実装
logSecurityEvent('RATE_LIMIT_EXCEEDED', ip, details)
logSecurityEvent('INVALID_ADMIN_CREDENTIALS', ip, details)  
logSecurityEvent('DEBUG_ENDPOINT_ACCESS_BLOCKED', ip, details)
```

**推奨監視項目**:
- Security Events（Cloudflareダッシュボード）
- Rate limiting triggers
- 異常なトラフィックパターン
- SSL証明書有効期限

### 🚨 緊急時対応

**DDoS攻撃時**:
1. Cloudflare Security Level を "I'm Under Attack" に変更
2. Rate Limiting を一時的に厳格化
3. 攻撃元IPのブロック
4. 攻撃終了後の設定復旧

**セキュリティインシデント**:
1. ログの確認・保存
2. 影響範囲の特定
3. 必要に応じた緊急メンテナンス
4. 事後対策の実施

### Cloudflare Pages設定

### ❌ Pagesデプロイメント無効化
誤ったCloudflare Pagesデプロイメントを防ぐ複数の安全装置：

1. **`.cfpagesignore`**: 全ファイルを無視してPagesビルドを強制失敗
2. **`pages-build-blocker.js`**: Pages環境を検出してブロックするスクリプト
3. **ビルドスクリプト統合**: ビルド前に自動的にブロッカーを実行
4. **ドキュメント**: `docs/DISABLE_CLOUDFLARE_PAGES.md`に詳細な削除手順

**Pagesビルドがまだ発生している場合**:
- CloudflareダッシュボードでPagesプロジェクトを確認
- このリポジトリに接続されたPagesプロジェクトを削除
- WorkersとKVサービスのみが設定されていることを確認

### 正しいアーキテクチャ
```
GitHubリポジトリ
├── Vercel (Next.jsアプリ) ← プライマリデプロイメント ✅
├── Cloudflare Workers (APIゲートウェイ) ← 手動デプロイメント ✅
├── Cloudflare KV (ストレージ) ← アクティブ ✅
└── Cloudflare Pages ← 無効化 ❌
```

## アーキテクチャ

### データフロー
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

### 複数期間サポート
システムは24時間と1時間のランキングをキャッシュ：
- キャッシュキー: `ranking-{genre}-24h`と`ranking-{genre}-hour`
- `ranking-{genre}`キーとの後方互換性を維持
- クライアント側の期間切り替えが新しいAPI呼び出しをトリガー

### スクレイピングアーキテクチャ
ハイブリッドスクレイパー(`complete-hybrid-scraper.ts`)の構成：
- **HTMLパース**: ジャンル別ランキングページとメタタグ抽出
- **タグ強化**: 個別動画ページからのタグデータスクレイピング
- **人気タグ**: サーバーレスポンスJSONからのトレンドタグ抽出
- **ジオブロック回避**: 全リクエストでGooglebot User-Agent使用

### 主要な技術的制約

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

## ジャンルと期間の管理

### サポート対象ジャンル
**事前キャッシュされるジャンル（7個）:**
```typescript
const CACHED_GENRES = ['all', 'game', 'entertainment', 'other', 'technology', 'anime', 'voicesynthesis']
```

**全ジャンル（オンデマンド対応）:**
すべての`RankingGenre`型で定義されたジャンルがAPIで利用可能。キャッシュされていないジャンルはオンデマンドで取得。

### 期間タイプ
- `'24h'` - 24時間ランキング（デフォルト）
- `'hour'` - 毎時ランキング

### タグサポート
- サーバーレスポンスから人気タグを抽出
- **「その他」ジャンルの人気タグ**: 事前キャッシュ（最初の300件）
- **他のジャンルのタグ**: 動的取得のみ
- タグ別ランキングも最大500件まで取得可能（ページネーション対応）
- キャッシュキー: `ranking-${genre}-${period}-tag-${tag}`（300件の配列）

## テスト哲学

厳格なテスト駆動開発(TDD)原則に従う。**機能実装前に必ずテストを作成する**

### TDDプロセス:
1. **Red**: 期待する動作を定義する失敗するテストを作成
2. **Green**: テストを通すための最小限のコードを作成
3. **Refactor**: テストを維持しながらコードを改善

### TDDベストプラクティス:
- **テストファースト**: 失敗するテストなしに本番コードを書かない
- **一度に1つのテスト**: 1つのテストを書き、通してから次へ
- **最小限の実装**: テストを通すのに必要十分なコードのみ作成
- **自信を持ってリファクタリング**: テストが通った後にコードをクリーンアップ
- **実装ではなく振る舞いをテスト**: どう動くかではなく、何をするかに焦点

### カバレッジ要件:
- 現在の閾値: 42%（リファクタリング中に90%から一時的に引き下げ）
- 目標: 全メトリクスで90%カバレッジへの復帰
- `npm run test:coverage`でカバレッジ確認

### テスト構成:
- `__tests__/unit/` - コンポーネントとユーティリティのテスト
- `__tests__/integration/` - APIとデータフローのテスト
- `__tests__/e2e/` - 完全なユーザージャーニーテスト（Playwright）

### テスト実行:
```bash
npm test                    # Watch mode
npm test -- --run          # Single run
npm run test:coverage      # With coverage report
npx vitest run <file>      # Run specific test file
```

### TDDワークフローの例:
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

## よくある落とし穴

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

## GitHubアクセス

### リポジトリ情報
- Repository: `YJSN180/nico-ranking-custom`
- Main branch: `main`
- PR workflow: Create feature branches, submit PRs, merge after CI passes

### GitHub認証
GitHub CLIで作業する際は、正しいアカウントがアクティブであることを確認：
```bash
# Check current authentication status
gh auth status

# Switch to YJSN180 account if needed
gh auth switch -u YJSN180

# If authentication fails, re-login
gh auth login
```

### GitHub CLIコマンド
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

### ブランチ操作
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

### CI/CDパイプライン
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

### デプロイメント
- `main`へのpush時にVercelへ自動デプロイ
- 全PRに対してプレビューデプロイメント
- 環境変数はVercelダッシュボードで管理

## ドキュメント管理ポリシー

### ファイルコミットルール

**コミット可能なファイル（許可リスト）:**
- `README.md` - プロジェクト概要とセットアップ手順
- `CLAUDE.md` - AIアシスタント用の指示ファイル（このファイル）
- ソースコードファイル（`.ts`, `.tsx`, `.js`, `.jsx`, `.css`など）
- 設定ファイル（`package.json`, `tsconfig.json`, `.eslintrc`など）
- テストファイル（`*.test.ts`, `*.spec.ts`）
- ビルド設定（`next.config.js`, `playwright.config.ts`など）
- CI/CD設定（`.github/workflows/`, `vercel.json`）

**gitignore必須ファイル（ブロックリスト）:**
- その他すべての`.md`ファイル（ドキュメント、ノート、ガイドなど）
- ドキュメントディレクトリ（`docs/`, `documentation/`, `doc/`）
- その他のドキュメント形式（`.rst`, `.txt`, `.adoc`, `.markdown`など）
- 一時ファイル（`.tmp`, `.bak`, `.log`）
- 環境ファイル（`.env*`）
- 生成ファイル（ビルド出力、カバレッジレポート）
- ツール固有ファイル（`.tools/`, `.claude/`, `.wrangler/`）

### ドキュメント作成ガイドライン

1. **ドキュメントファイルを自動作成しない** - 明示的に要求された場合のみ作成
2. **適切なgitignoreパターンを使用** - 新しいドキュメントタイプが適切に除外されることを確認
3. **クリーンなリポジトリを維持** - バージョン管理には必須ファイルのみを保持
4. **セキュリティ第一** - いかなるドキュメントにも機密情報をコミットしない

### プロジェクト構造の整理

**すべての技術ドキュメントは`/docs`ディレクトリに移動（gitignore対象）**:
- デプロイメントガイド
- セキュリティドキュメント
- パフォーマンスレポート
- 設定ガイド

プロジェクトルートをクリーンに保ち、必須ファイルのみに集中。`/docs`フォルダには以下を含む：
- Cloudflareセットアップガイド
- セキュリティ設定
- パフォーマンス最適化レポート
- デプロイメントチェックリスト

**重要**: 新規作成するMDファイルは必ず`/docs`ディレクトリに配置すること。
プロジェクトルートには`README.md`と`CLAUDE.md`のみを配置。

## マルチエージェントタスク管理

### 複数サブエージェントを使用する場合

以下を含む複雑なタスクには複数のサブエージェントを使用：

1. **並列処理要件**:
   - 複数の独立したAPI呼び出し
   - 並行ファイル操作
   - 異なるモジュール間での同時テスト実行

2. **専門領域知識**:
   - フロントエンドUIコンポーネント + バックエンドAPIロジック
   - テスト戦略 + 実装
   - セキュリティ分析 + パフォーマンス最適化

3. **大規模リファクタリング**:
   - データベーススキーマ変更 + API更新 + フロントエンド調整
   - マルチサービスデプロイメント
   - 横断的なアーキテクチャ変更

### サブエージェント調整ガイドライン

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

### マルチエージェントシナリオの例

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