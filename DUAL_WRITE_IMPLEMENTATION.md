# Dual Write Implementation for Cloudflare KV Migration

## 概要

Vercel KVからCloudflare KVへの移行を安全に行うため、両方のKVに書き込む「デュアルライト」期間を実装しました。

## 実装内容

### 1. 書き込み処理の更新

#### `/lib/update-ranking.ts`
- Vercel KVへの既存の書き込みを維持
- 全データ収集後、Cloudflare KVへ一括書き込み
- エラーハンドリング：Cloudflare KVの書き込み失敗は無視（Vercel KVは成功）

#### `/app/api/cron/fetch/route.ts`
- 同様にデュアルライト実装
- 人気タグとタグ別ランキングも含めてCloudflare KVに保存

### 2. 読み取り処理の優先順位

#### `/app/page.tsx` (サーバーコンポーネント)
1. **Cloudflare KV** (最優先)
2. **Vercel KV** (フォールバック)
3. **動的スクレイピング** (最終手段)

#### `/app/api/ranking/route.ts` (API)
- 既にCloudflare KV優先で実装済み
- 環境変数 `CLOUDFLARE_KV_NAMESPACE_ID` で判定

### 3. データ移行スクリプト

`/scripts/migrate-to-cloudflare-kv.ts`
- 既存のVercel KVデータをCloudflare KVへ移行
- タグ別ランキングも含めて完全移行

## 環境変数

### Cloudflare KV (必須)
```bash
CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
CLOUDFLARE_KV_API_TOKEN=ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj
```

### Vercel KV (移行期間中は必須)
```bash
KV_REST_API_URL=<your-value>
KV_REST_API_TOKEN=<your-value>
```

## 移行手順

### フェーズ1: デュアルライト期間（現在）
1. ✅ 両方のKVに書き込み
2. ✅ Cloudflare KV優先で読み取り
3. ✅ Vercel KVはフォールバック

### フェーズ2: データ検証
1. 移行スクリプトの実行
   ```bash
   npx tsx scripts/migrate-to-cloudflare-kv.ts
   ```
2. データ整合性の確認
3. パフォーマンステスト

### フェーズ3: Vercel KV削除
1. すべての `import { kv } from '@vercel/kv'` を削除
2. Vercel KV関連のコードを削除
3. 環境変数の削除
4. パッケージの削除: `npm uninstall @vercel/kv`

## 注意事項

- **コスト**: Vercel KV無料枠は3,000コマンド/日（現在7,818コマンド/日使用）
- **データ構造**: Cloudflare KVは単一キー（`RANKING_LATEST`）に全データを圧縮保存
- **パフォーマンス**: Cloudflare KVはグローバルエッジで高速配信

## モニタリング

### 書き込み成功率
- Cronジョブのログでエラーを監視
- Cloudflare KVダッシュボードで書き込み状況確認

### 読み取りパフォーマンス
- APIレスポンスヘッダーで確認
  - `X-Cache-Status: CF-HIT` - Cloudflare KVから取得
  - `X-Cache-Status: HIT` - Vercel KVから取得
  - `X-Cache-Status: MISS` - 動的取得