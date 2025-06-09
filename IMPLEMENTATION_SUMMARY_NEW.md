# 実装要約: Vercel + Convex + Cloudflare KV 移行

## 実装内容

### 1. Convex バックエンド

#### `convex/schema.ts`
- Cron ジョブのステータス追跡用スキーマ
- ヘルスチェック用テーブル

#### `convex/updateRanking.ts`
- **23ジャンル × 2期間 = 46データセット**を取得
- 各ジャンル/期間で最大500件を取得（5ページ × 100件）
- 人気タグを抽出し、タグ別ランキングも500件ずつ取得
- Googlebot User-Agentでジオブロッキング回避
- サムネイルURLを.Mから.Lに変換（高解像度化）

#### `convex/cloudflareKVWriter.ts`
- データをgzipで圧縮
- Cloudflare KV APIを使用して単一書き込み
- メタデータも同時に保存

#### `convex/crons.ts`
- 10分間隔でupdateAllRankingsを実行

### 2. Cloudflare KV 統合

#### `lib/cloudflare-kv.ts`
- データの圧縮/解凍機能
- KVへの読み書きヘルパー関数
- ジャンル別、タグ別データの取得関数

### 3. Vercel Edge API

#### `app/api/ranking-cf/route.ts`
- Cloudflare KVから圧縮データを読み取り
- ページネーション対応（limit/offset）
- Edge Runtimeで高速レスポンス

### 4. テスト

#### `__tests__/integration/convex-cloudflare-kv.test.ts`
- Convex関数のテスト
- データ圧縮のテスト
- 無料枠制限のチェック

#### `__tests__/integration/vercel-edge-kv-api.test.ts`
- API エンドポイントのテスト
- エラーハンドリングのテスト

## 主な改善点

1. **スケーラビリティ**: 全23ジャンル対応（従来は7ジャンルのみ）
2. **データ量**: 各ジャンル500件まで取得可能（従来は300件）
3. **効率性**: 単一KV書き込みで無料枠内に収まる（144回/日）
4. **高解像度**: サムネイル画像を640×360にアップグレード
5. **圧縮**: gzip圧縮で1MB制限内に収める

## データ構造

```typescript
{
  genres: {
    [genre]: {
      '24h': {
        items: RankingItem[500],
        popularTags: string[],
        tags: {
          [tag]: RankingItem[500]
        }
      },
      'hour': { ... }
    }
  },
  metadata: {
    version: 1,
    updatedAt: ISO timestamp,
    totalItems: number
  }
}
```

## 環境変数

### Convex
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_NAMESPACE_ID`
- `CLOUDFLARE_KV_API_TOKEN`

### Vercel
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_NAMESPACE_ID`
- `CLOUDFLARE_KV_API_TOKEN_READ`