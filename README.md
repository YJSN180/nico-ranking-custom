# ニコニコ24h総合ランキング表示サイト

ニコニコ動画の24時間総合ランキングを1時間ごとに取得し、最大100件を表示するサイトです。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YJSN180/nico-ranking-custom)

## 技術スタック

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Storage**: Vercel KV, Supabase (例のソレジャンル用)
- **Deployment**: Vercel
- **Testing**: Vitest, Playwright
- **Package Manager**: npm

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成し、必要な値を設定します：

```bash
cp .env.example .env.local
```

必要な環境変数：
- `KV_REST_API_URL`: Vercel KVのREST API URL
- `KV_REST_API_TOKEN`: Vercel KVのアクセストークン
- `NEXT_PUBLIC_BASE_URL`: サイトのベースURL（ローカルは `http://localhost:3000`）
- `CRON_SECRET`: Cron Job実行時の認証用シークレット
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase プロジェクトのURL（例のソレジャンル用）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key（例のソレジャンル用）

## GitHub Actionsの設定

ランキングデータを自動的に更新するため、GitHub Actionsを使用します：

1. GitHubリポジトリの Settings > Secrets and variables > Actions で `CRON_SECRET` を設定
2. `.github/workflows/update-ranking.yml` が30分ごとに実行されます
3. 手動実行も可能: Actions タブから "Update Nico Ranking Data" を選択して "Run workflow"

### 3. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアクセスできます。

## テスト

### ユニットテスト・統合テスト

```bash
# テストの実行
npm test

# カバレッジ付きテスト
npm run test:coverage
```

### E2Eテスト

```bash
# Playwrightのブラウザをインストール（初回のみ）
npx playwright install

# E2Eテストの実行
npm run test:e2e
```

## デプロイ

### Vercelへのデプロイ

1. Vercelアカウントを作成
2. プロジェクトをGitHubにpush
3. VercelでGitHubリポジトリを連携
4. 環境変数を設定
5. デプロイ実行

```bash
# CLIでのデプロイ
vercel --prod
```

### Cron Jobの設定

`vercel.json` に定義されているCron Jobが自動的に設定されます：
- 毎時0分にRSSを取得
- KVに65分間のTTLで保存

## アーキテクチャ

### データフロー

1. **Cron Job** (`/api/cron/fetch`)
   - 1時間ごとに実行
   - ニコニコ動画のRSSを取得
   - XMLをパースして正規化
   - Vercel KVに保存（TTL: 65分）

2. **API Route** (`/api/ranking`)
   - Edge Runtimeで実行
   - KVからデータを取得
   - 30秒のキャッシュヘッダー付きで返却

3. **ホームページ** (`/`)
   - React Server Component
   - 30秒のISR（Incremental Static Regeneration）
   - 最大100件のランキングを表示（ニコニコ動画API仕様による制限）

## 開発ガイドライン

- **TDD（テスト駆動開発）**を厳守
- TypeScriptの`strict`モードと`noUncheckedIndexedAccess`を有効化
- ESLintエラーは0を維持
- テストカバレッジ90%以上を維持

## トラブルシューティング

### KVへの接続エラー
- 環境変数が正しく設定されているか確認
- Vercel KVのダッシュボードでトークンを再生成

### Cron Jobが実行されない
- `CRON_SECRET`が正しく設定されているか確認
- Vercelダッシュボードでログを確認

### ランキングが表示されない
- `/api/ranking`のレスポンスを確認
- KVにデータが保存されているか確認

## Supabase セットアップ（例のソレジャンル用）

### 1. Supabaseプロジェクトの作成
1. [Supabase](https://supabase.com)でアカウント作成
2. 新しいプロジェクトを作成
3. Project Settings > API から URL と anon key を取得

### 2. データベースの初期化
SQL Editorで以下のマイグレーションを実行：

```sql
-- /supabase/migrations/001_create_rei_sore_tables.sql の内容を実行
```

### 3. 例のソレランキングの更新
```bash
# 手動でランキングを更新
npx tsx scripts/update-rei-sore-ranking.ts
```

### 機能説明
- **通常ジャンル**: Niconico公式APIから直接取得（JSON形式）
- **例のソレジャンル**: Snapshot APIで収集し、Supabaseでランキング計算
- ランキングアルゴリズムは実際のニコニコランキングを分析して再現
  - いいね数を最重視（40倍の重み）
  - エンゲージメント率によるボーナス
  - 時間経過による減衰