# ニコニコランキング (Re:turn)

[![CI](https://github.com/YJSN180/nico-ranking-custom/actions/workflows/ci.yml/badge.svg)](https://github.com/YJSN180/nico-ranking-custom/actions/workflows/ci.yml)
[![Update Nico Ranking Data](https://github.com/YJSN180/nico-ranking-custom/actions/workflows/update-ranking-parallel.yml/badge.svg)](https://github.com/YJSN180/nico-ranking-custom/actions/workflows/update-ranking-parallel.yml)

ニコニコ動画のランキングを表示するWebアプリケーション。24時間ランキングと毎時ランキングを高速に配信します。

## 🌐 サイト

[https://nico-rank.com](https://nico-rank.com)

## ✨ 特徴

- **高速表示**: Cloudflare KVによるキャッシュで瞬時に表示
- **自動更新**: 10分ごとに最新ランキングを取得
- **多ジャンル対応**: 全23ジャンルのランキングに対応
- **タグ別ランキング**: 人気タグでのフィルタリング機能
- **レスポンシブ**: PC・スマートフォン両対応
- **ダークモード**: 3種類のテーマから選択可能
- **NGフィルタ**: 不要な動画を非表示にする機能

## 🏗️ アーキテクチャ

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cloudflare    │────▶│     Vercel      │────▶│   Nico Nico    │
│    Workers      │     │   (Next.js)     │     │     API        │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │                                                │
         │                                                │
         ▼                                                ▼
┌─────────────────┐                            ┌─────────────────┐
│  Cloudflare KV  │◀───────────────────────────│  GitHub Actions │
│  (Cache Store)  │      (Fallback Update)     │   (Cron Job)   │
└─────────────────┘                            └─────────────────┘
```

### 主要コンポーネント

- **Vercel**: Next.js アプリケーションのホスティング
- **Cloudflare Workers**: API Gateway & レート制限
- **Cloudflare KV**: ランキングデータのキャッシュストレージ
- **GitHub Actions**: データ更新のcronジョブ（10分間隔）

## 🎨 カスタムフォント設定

タイトルにカスタムフォントを使用しています。以下のフォントファイルを配置してください：

1. **ニコモジ+v2** (ニコニコランキング部分)
   - ファイル名: `nicomoji-plus_v2-5.ttf`
   - 配置先: `public/fonts/nicomoji-plus-v2.ttf`

2. **Comic Sans MS Bold** ((Re:turn)部分)
   - ファイル名: `comic-sans-ms.ttf`
   - 配置先: `public/fonts/comic-sans-ms-bold.ttf`

フォントファイルがない場合は、代替フォントが使用されます。

## 🚀 セットアップ

### 前提条件

- Node.js 20.x
- npm 10.x
- Cloudflare アカウント
- Vercel アカウント

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/YJSN180/nico-ranking-custom.git
cd nico-ranking-custom

# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.localを編集して必要な値を設定

# 開発サーバーの起動
npm run dev
```

### 環境変数

`.env.local`に以下の環境変数を設定：

```env
# Cloudflare KV
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_api_token

# 認証
CRON_SECRET=your_cron_secret
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
WORKER_AUTH_KEY=your_worker_key
```

## 📝 開発

### 利用可能なスクリプト

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run start        # プロダクションサーバー起動
npm run lint         # ESLint実行
npm run typecheck    # TypeScript型チェック
npm test             # テスト実行
npm run test:e2e     # E2Eテスト実行
```

### プロジェクト構造

```
.
├── app/              # Next.js App Router
├── components/       # Reactコンポーネント
├── lib/              # ユーティリティ関数
├── types/            # TypeScript型定義
├── workers/          # Cloudflare Workers
├── __tests__/        # テストファイル
└── public/           # 静的ファイル
```

## 🔒 セキュリティ

- 管理画面はBasic認証で保護
- レート制限実装（3層構造）
- CSPヘッダー設定
- 環境変数による機密情報管理

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

Issue や Pull Request は歓迎します。大きな変更を行う場合は、まず Issue を作成して議論してください。

## 📞 お問い合わせ

問題や質問がある場合は、[Issues](https://github.com/YJSN180/nico-ranking-custom/issues) でお知らせください。