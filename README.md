# Nico Ranking Re:turn

ニコニコ動画のランキングを快適に閲覧するためのWebアプリケーション。Cloudflare KVとGitHub Actionsを使用した高速・安定したランキング配信システム。

## 特徴

- 🚀 **高速表示**: Cloudflare KVによる分散キャッシュ
- 🛡️ **DDoS対策**: Cloudflare Workersによる強力な保護
- 🔄 **自動更新**: 10分ごとの自動ランキング更新
- 📱 **レスポンシブ**: モバイル・デスクトップ両対応
- 🏷️ **タグ検索**: 人気タグによる絞り込み
- 🌙 **ダークモード**: 3つのテーマから選択可能
- 🚫 **NGフィルタ**: カスタムブロックリスト機能

## 技術スタック

- **フロントエンド**: Next.js 14, React 18, TypeScript
- **データストレージ**: Cloudflare KV（メイン）, Vercel KV（バックアップ）
- **ホスティング**: Vercel
- **CDN/セキュリティ**: Cloudflare Workers
- **定期実行**: GitHub Actions
- **スクレイピング**: Cheerio, fast-xml-parser

## アーキテクチャ

```
[ユーザー] 
    ↓
[Cloudflare CDN/WAF/DDoS保護]
    ↓
[Cloudflare Workers（レート制限）]
    ↓
[Vercel App (Next.js)]
    ↓↑
[Cloudflare KV]（データストレージ）
    ↑
[GitHub Actions]（10分ごとの更新）
```

## セットアップ

### 1. 環境変数の設定

`.env.local`ファイルを作成：

```bash
cp .env.local.example .env.local
```

必要な環境変数：

```bash
# Vercel KV
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token

# Cloudflare KV
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_cloudflare_kv_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_cloudflare_kv_api_token

# 管理者認証
ADMIN_KEY=your_secure_admin_key_32_chars_minimum
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_admin_password

# Cron認証
CRON_SECRET=your_cron_secret
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

### 4. Cloudflareの設定

詳細な手順は[CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)を参照してください。

## デプロイ

### Vercelへのデプロイ

```bash
# Vercel CLIをインストール
npm i -g vercel

# デプロイ
vercel
```

### Cloudflare Workersのデプロイ

```bash
# Wranglerをインストール
npm i -g wrangler

# ログイン
wrangler login

# デプロイ
npm run deploy:worker
```

### GitHub Actionsの設定

`.github/workflows/update-ranking.yml`が自動的に10分ごとにランキングを更新します。

必要なGitHub Secrets：
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_NAMESPACE_ID`
- `CLOUDFLARE_KV_API_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## 開発

### コマンド一覧

```bash
# 開発
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run start        # プロダクションサーバー起動

# テスト
npm test             # ユニット/統合テスト（watch mode）
npm test -- --run    # テスト実行（CI用）
npm run test:coverage # カバレッジレポート
npm run test:e2e     # E2Eテスト
npm run test:all     # 全テスト実行

# コード品質
npm run lint         # ESLint
npm run typecheck    # TypeScript型チェック
npm run check:all    # 全チェック実行

# Cloudflare Workers
npm run dev:worker   # Workers開発サーバー
npm run deploy:worker # Workersデプロイ
npm run tail:worker  # Workersログ確認

# データ更新
npm run update:ranking-github # 手動でランキング更新
```

### プロジェクト構造

```
├── app/                    # Next.js App Router
│   ├── api/               # APIルート
│   ├── page.tsx           # ホームページ
│   └── layout.tsx         # レイアウト
├── components/            # Reactコンポーネント
├── hooks/                 # カスタムフック
├── lib/                   # ユーティリティ関数
├── scripts/               # スクリプト
├── workers/               # Cloudflare Workers
├── __tests__/            # テストファイル
└── types/                # TypeScript型定義
```

## NG機能の管理

### 管理画面へのアクセス

```
https://yourdomain.com/admin
```

Basic認証でログイン後、NGリストの管理が可能です。

### NG対象

- 動画ID
- 動画タイトル（部分一致）
- 投稿者ID
- 投稿者名（部分一致）

## トラブルシューティング

### ランキングが更新されない

1. GitHub Actionsの実行状況を確認
2. Cloudflare KVの書き込み権限を確認
3. 環境変数が正しく設定されているか確認

### 503エラーが発生する

1. Vercelアプリが正常に動作しているか確認
2. Cloudflare WorkersのNEXT_APP_URLが正しいか確認
3. `wrangler tail`でエラーログを確認

### レート制限に引っかかる

1. Cloudflareダッシュボードでレート制限ルールを調整
2. 必要に応じてIPをホワイトリストに追加

## ライセンス

MIT License

## 貢献

プルリクエストを歓迎します。大きな変更を行う場合は、まずissueを作成して変更内容を議論してください。

## 謝辞

- ニコニコ動画APIの仕様を解析してくださった方々
- Cloudflare Workersのサンプルコードを提供してくださった方々