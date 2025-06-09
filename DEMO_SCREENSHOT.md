# ニコニコ動画ランキング - デモとスクリーンショット

## 実装完了状況

### ✅ 完了した機能

1. **Convex連携**
   - 10分ごとのcronジョブで全23ジャンルのランキングを取得
   - 各ジャンルの人気タグTop5のランキングも取得（最大500件）
   - Convex DBに履歴データを保存

2. **Cloudflare KV連携**
   - フルスナップショットをgzip圧縮して1つのキーで保存
   - Edge Runtimeから高速アクセス可能

3. **API実装**
   - `/api/snapshot` - フルスナップショットを取得
   - `/api/ranking` - ジャンル・期間・タグでフィルタリング
   - ページネーション対応（100件/ページ）

4. **環境設定**
   - Cloudflare KV: 名前空間ID `80f4535c379b4e8cb89ce6dbdb7d2dc9`
   - Cloudflareアカウント: `5984977746a3dfcd71415bed5c324eb1`
   - Convexデプロイメント: `judicious-lemming-629`

## データ構造の例

### Cloudflare KVに保存されるデータ
```json
{
  "timestamp": "2025-06-09T05:07:48.228Z",
  "version": "1.0",
  "genres": {
    "all": {
      "24h": {
        "items": [
          {
            "rank": 1,
            "id": "sm43806917",
            "title": "【例の紐】ヘスティア様をつくってみた【3Dプリンター】",
            "thumbURL": "https://nicovideo.cdn.nimg.jp/thumbnails/43806917/43806917.L",
            "views": 245892,
            "comments": 3456,
            "mylists": 1234,
            "likes": 5678,
            "tags": ["例の紐", "ヘスティア", "3Dプリンター"],
            "authorId": "12345678",
            "authorName": "技術部員A",
            "registeredAt": "2025-01-15T12:00:00Z"
          }
        ],
        "popularTags": ["例の紐", "ゲーム", "VOICEROID実況", "技術", "歌ってみた"]
      },
      "hour": {
        "items": [...],
        "popularTags": [...]
      }
    },
    "game": { ... },
    // 他の21ジャンル
  }
}
```

## アクセス方法

1. **開発環境**
   ```bash
   npm run dev
   http://localhost:3000
   ```

2. **本番環境（Cloudflare Pages）**
   - GitHubリポジトリをCloudflare Pagesに連携後
   - `https://nico-ranking.pages.dev`（仮のURL）

## 主な機能

- 📊 **リアルタイムランキング** - 10分ごとに更新
- 🏷️ **タグフィルタリング** - 人気タグでの絞り込み
- 📱 **レスポンシブ対応** - モバイル/デスクトップ両対応
- 🌙 **ダークモード** - 3つのテーマ（ライト/ダーク/ダークブルー）
- ♾️ **無限スクロール** - 最大500件まで自動読み込み
- 🚫 **NGフィルタ** - 不要な動画/投稿者を非表示

## Convex Dashboard

cronジョブの実行状況は以下で確認できます：
https://dashboard.convex.dev/d/judicious-lemming-629