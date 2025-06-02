# ハイブリッドキャッシング実装ガイド

## 概要

人気のあるコンテンツは事前キャッシュ、それ以外は動的取得というハイブリッドアプローチを実装します。

## 実装のポイント

### 1. 人気タグの判定

**使用統計ベース**：
```typescript
// lib/tag-popularity-tracker.ts
- タグアクセスごとにカウントを記録
- 過去7日間の統計を保持
- 上位10タグを事前キャッシュ対象に
```

**デフォルトの人気タグとマージ**：
```typescript
// 新規タグや季節タグも考慮
const tagsToCache = Array.from(new Set([
  ...defaultPopularTags.slice(0, 10),
  ...usageBasedTags
])).slice(0, 10)
```

### 2. 動的TTL設定

```typescript
// タグの人気度に応じてTTLを調整
- Top 10: 1時間（事前キャッシュ＋長めのTTL）
- Top 11-20: 2時間（オンデマンド＋中程度のTTL）
- その他: 30分（オンデマンド＋短いTTL）
```

### 3. 段階的移行

**Phase 1**（現在）：
- 使用統計の収集開始
- 既存の5タグキャッシュを維持

**Phase 2**（1週間後）：
- 統計データに基づいて10タグに拡張
- cronジョブの更新（route-hybrid.ts使用）

**Phase 3**（2週間後）：
- 動的TTLの有効化
- APIルートの更新（route-hybrid.ts使用）

## 実装手順

### 1. タグ使用統計の収集開始

```typescript
// app/api/ranking/route.ts に追加
import { trackTagUsage } from '@/lib/tag-popularity-tracker'

// タグアクセス時に統計を記録
if (tag) {
  await trackTagUsage(genre, tag)
}
```

### 2. cronジョブの更新（1週間後）

```bash
# 既存のroute.tsをバックアップ
cp app/api/cron/fetch/route.ts app/api/cron/fetch/route.backup.ts

# ハイブリッド版に置き換え
cp app/api/cron/fetch/route-hybrid.ts app/api/cron/fetch/route.ts
```

### 3. APIルートの更新（動的TTL有効化）

```bash
# 既存のroute.tsをバックアップ  
cp app/api/ranking/route.ts app/api/ranking/route.backup.ts

# ハイブリッド版に置き換え
cp app/api/ranking/route-hybrid.ts app/api/ranking/route.ts
```

## 監視項目

### KVストレージ使用量
```typescript
// 現在: 約4.4MB
// 予想: 約9-10MB（許容範囲内）
```

### パフォーマンスメトリクス
- キャッシュヒット率（目標: 85%以上）
- 平均レスポンス時間（目標: 200ms以下）
- cronジョブ実行時間（目標: 3分以内）

### エラー率
- APIエラー率（閾値: 1%）
- タグ取得失敗率（閾値: 5%）

## ロールバック手順

問題が発生した場合：

```bash
# cronジョブを元に戻す
cp app/api/cron/fetch/route.backup.ts app/api/cron/fetch/route.ts

# APIルートを元に戻す  
cp app/api/ranking/route.backup.ts app/api/ranking/route.ts

# デプロイ
git add -A && git commit -m "Rollback to previous caching strategy"
git push origin main
```

## メリット

1. **パフォーマンス向上**
   - 人気コンテンツの90%が即座に配信
   - 平均レスポンス時間の大幅短縮

2. **リソース効率**
   - 無駄なキャッシュを削減
   - Vercel無料プランに最適化

3. **柔軟性**
   - 新しい人気タグに自動対応
   - 季節やトレンドの変化に追従

4. **スケーラビリティ**
   - 数千人規模のアクセスに対応
   - APIコール数を最小限に抑制