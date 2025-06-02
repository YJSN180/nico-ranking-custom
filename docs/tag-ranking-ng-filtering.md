# タグ別ランキングのNGフィルタリング実装

## 背景
タグ別ランキングは、通常のジャンル別ランキングと異なり、事前に全てのタグに対して300件ずつキャッシュすることは非現実的です（数百のタグ×300件）。

## 実装方法
タグ別ランキングに対しては、表示時（ランタイム）にNGフィルタリングを適用します。

### 1. APIレベルでのフィルタリング
`/api/ranking/route.ts`で、タグ別ランキングの場合のみフィルタリングを適用：

```typescript
// タグ別ランキングの場合はNGフィルタリングを適用
let filteredItems = items
if (tag) {
  const { items: filtered } = await filterRankingData({ items })
  filteredItems = filtered
}
```

### 2. キャッシュされたデータの処理
キャッシュから取得したデータにも同様にフィルタリングを適用します。

## パフォーマンス最適化

### 1. NGリストのメモリキャッシュ
```typescript
let ngListCache: NGList | null = null
let ngListCacheTime = 0
const CACHE_DURATION = 60000 // 1分間キャッシュ
```

### 2. Set型による高速検索
```typescript
const videoIdSet = new Set([...ngList.videoIds, ...ngList.derivedVideoIds])
const titleSet = new Set(ngList.videoTitles)
const authorIdSet = new Set(ngList.authorIds)
const authorNameSet = new Set(ngList.authorNames)
```

Array.includes()のO(n)に対して、Set.has()はO(1)で検索できます。

## 影響
- タグ別ランキングの初回表示時：+5-10ms程度の遅延
- 2回目以降（キャッシュヒット時）：+2-3ms程度の遅延

この程度の遅延はユーザー体験に影響を与えないレベルです。