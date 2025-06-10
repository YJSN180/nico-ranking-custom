# アーキテクチャ移行提案: GitHub Actions + Cloudflare D1

## 現状の問題
- Convexのスタータープランを大幅に超過（Database 2.2倍、Bandwidth 2.4倍）
- プロジェクトが無効化されている
- 月額料金が発生する可能性

## 提案する新アーキテクチャ

### 1. GitHub Actions（データ収集）
- **cronジョブ**: 10分間隔でGitHub Actionsのスケジュールワークフローを実行
- **データ取得**: 23ジャンル × 2期間 × 500件 + 人気タグ
- **NGフィルタリング**: Vercel KVからNGリストを取得してフィルタリング
- **データ保存**: Cloudflare D1またはKVに保存

```yaml
# .github/workflows/update-ranking.yml
name: Update Ranking Data
on:
  schedule:
    - cron: '*/10 * * * *'  # 10分ごと
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Update ranking data
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_D1_DATABASE_ID: ${{ secrets.CLOUDFLARE_D1_DATABASE_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          VERCEL_KV_URL: ${{ secrets.VERCEL_KV_URL }}
          VERCEL_KV_TOKEN: ${{ secrets.VERCEL_KV_TOKEN }}
        run: npm run update:ranking
```

### 2. Cloudflare D1（データ保存）
- **メリット**:
  - 無料枠: 5GB（現在の使用量1.14GBなら余裕）
  - SQLiteベースで高速
  - Cloudflare Workersとの相性が良い
  - 読み取り500万回/日、書き込み10万回/日

```sql
-- スキーマ例
CREATE TABLE rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  genre TEXT NOT NULL,
  period TEXT NOT NULL,
  tag TEXT,
  data TEXT NOT NULL, -- JSON (圧縮)
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(genre, period, tag)
);

CREATE INDEX idx_rankings_lookup ON rankings(genre, period, tag);
```

### 3. Cloudflare Workers（API）
- Vercelの代わりにCloudflare Workersを使用
- D1から直接データを読み取り
- 高速でコスト効率的

```typescript
// workers/api.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    if (url.pathname === '/api/ranking') {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || '24h'
      const tag = url.searchParams.get('tag')
      
      const result = await env.DB.prepare(
        'SELECT data FROM rankings WHERE genre = ? AND period = ? AND tag = ?'
      ).bind(genre, period, tag || null).first()
      
      if (!result) {
        return new Response('Not found', { status: 404 })
      }
      
      // 解凍して返す
      const compressed = new Uint8Array(JSON.parse(result.data))
      const decompressed = pako.ungzip(compressed, { to: 'string' })
      
      return new Response(decompressed, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30',
        },
      })
    }
    
    return new Response('Not found', { status: 404 })
  },
}
```

## 移行手順

1. **Cloudflare D1データベース作成**
   ```bash
   npx wrangler d1 create nico-ranking
   npx wrangler d1 execute nico-ranking --file=./schema.sql
   ```

2. **GitHub Actionsワークフロー作成**
   - 上記のYAMLファイルを作成
   - シークレットを設定

3. **更新スクリプト作成**
   ```typescript
   // scripts/update-ranking-d1.ts
   import { updateRankingWithNG } from './lib/update-ranking'
   import { CloudflareD1Client } from './lib/cloudflare-d1'
   
   async function main() {
     const data = await updateRankingWithNG()
     const client = new CloudflareD1Client()
     await client.saveRankingData(data)
   }
   ```

4. **フロントエンドの更新**
   - APIエンドポイントをCloudflare Workersに変更
   - または、Vercelから内部的にCloudflare Workersを呼び出す

## コスト比較

### 現在（Convex）
- 無料枠を超過 → 有料プランが必要
- 月額約$25〜

### 提案（GitHub Actions + Cloudflare）
- GitHub Actions: 無料（パブリックリポジトリ）
- Cloudflare D1: 無料枠で十分
- Cloudflare Workers: 無料枠で十分（10万リクエスト/日）
- **合計: $0/月**

## メリット
1. **完全無料**で運用可能
2. **スケーラブル** - 将来的にトラフィックが増えても対応可能
3. **高速** - CloudflareのエッジネットワークでCDN効果
4. **シンプル** - SQLiteベースで管理しやすい
5. **透明性** - GitHub Actionsのログで実行状況を確認可能

## デメリット
1. 初期セットアップがやや複雑
2. リアルタイムの更新は難しい（10分間隔）
3. 複数のサービスを管理する必要がある

## 代替案: Cloudflare KVのみ使用
もしD1の設定が複雑な場合は、既存のCloudflare KVをそのまま使用：
- 書き込み: GitHub Actionsから直接Cloudflare KV APIを呼び出し
- 読み取り: 既存の実装をそのまま使用
- Convexは完全に削除