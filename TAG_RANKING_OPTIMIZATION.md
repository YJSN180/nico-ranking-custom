# タグ別ランキングの最適化案

## 現状の問題点
1. タグ別ランキングは毎回オンデマンドでスクレイピング
2. 300件以上読み込む場合、Function実行時間が長くなる
3. キャッシュがないため、同じタグでも毎回スクレイピング

## Vercel無料プランでの制限
- Function実行時間: 100時間/月
- 1リクエストあたり: 最大10秒
- 帯域幅: 100GB/月

## 最適化案

### 1. キャッシュ期間の延長
現在: 15分（900秒）
```typescript
await kv.set(cacheKey, filteredItems, { ex: 900 })
```

提案: 1時間（3600秒）に延長
```typescript
await kv.set(cacheKey, filteredItems, { ex: 3600 })
```

### 2. 最大取得件数の制限
現在: 無制限（ユーザーが読み込む限り）

提案: 最大500件に制限
```typescript
// app/client-page.tsx
const MAX_TAG_ITEMS = 500

// loadMoreItems関数内
if (rankingData.length >= MAX_TAG_ITEMS) {
  setHasMore(false)
  return
}
```

### 3. 人気タグの事前キャッシュ拡大
現在: 上位5タグのみ

提案: 上位10タグまで拡大（cronジョブで）
```typescript
// app/api/cron/fetch/route.ts
for (const tag of popularTags.slice(0, 10)) {
  // 事前キャッシュ
}
```

### 4. ページネーション最適化
現在: 100件ずつ

提案: 
- 初回200件
- 2回目以降100件ずつ
```typescript
const limit = page === 1 ? 200 : 100
```

## 実装の優先順位

1. **キャッシュ期間延長**（即効性高・実装簡単）
2. **最大件数制限**（リスク回避・実装簡単）
3. **人気タグ拡大**（UX向上・実装中程度）
4. **ページネーション最適化**（UX向上・実装複雑）

## 効果予測
- Function実行時間: 約50%削減
- キャッシュヒット率: 約70%向上
- ユーザー体験: 初回読み込み速度2倍