# キャッシング方式変更による機能退化問題

## 問題の本質

### 現状の仕組み
```
マイナータグ（オンデマンド）: 100件 × 5ページ = 最大500件表示可能
　　　↓ 人気上昇
人気タグ（事前キャッシュ）: 300件固定 = 最大300件のみ
```

**結果**: ユーザーから見ると「機能が劣化」している

### 具体例
1. 「ボカロオリジナル曲」タグ
   - 月曜: マイナーなので動的取得 → 500位まで閲覧可能
   - 火曜: 人気急上昇で事前キャッシュ対象に → 300位で打ち止め
   - ユーザー: 「なぜ400位の推し曲が見れなくなった？」

## 根本原因

事前キャッシュの制限：
- cronジョブで300件に固定
- それ以上のデータ取得手段なし
- KVストレージ節約のための妥協

## 解決策

### 案A: ハイブリッド拡張方式（推奨）

```typescript
// 事前キャッシュ + オンデマンド拡張
if (tag && isPopularTag(tag)) {
  // 1-300位: 事前キャッシュから高速配信
  if (page <= 3) {
    return getCachedData(tag, page)
  }
  // 301-500位: オンデマンドで追加取得
  else if (page <= 5) {
    return fetchDynamicData(tag, page)
  }
}
```

**実装イメージ**:
```typescript
// app/api/ranking/route.ts
const cacheKey = `ranking-${genre}-${period}-tag-${tag}`

if (page <= 3) {
  // 最初の300件は事前キャッシュから
  const cached = await kv.get(cacheKey)
  if (cached) {
    const startIdx = (page - 1) * 100
    const items = cached.items.slice(startIdx, startIdx + 100)
    return NextResponse.json(items)
  }
} else {
  // 4ページ目以降は動的取得
  const items = await fetchRankingWithRetry(genre, period, tag, 100, page)
  return NextResponse.json(items)
}
```

### 案B: 事前キャッシュを500件に拡張

```typescript
// cronジョブで500件まで取得
const TARGET_COUNT = 500 // 300から増やす
```

**問題点**:
- KVストレージ使用量が1.67倍に増加
- cronジョブの実行時間が長くなる

### 案C: 完全動的取得に統一

```typescript
// タグランキングは全て動的取得
// 人気度に関わらず一貫した体験
```

**問題点**:
- 人気タグへの大量アクセス時にAPIコール激増
- 初回読み込みが遅い

## 推奨実装詳細（案A）

### 1. API Route 改修

```typescript
export async function GET(request: NextRequest) {
  const page = parseInt(searchParams.get('page') || '1')
  
  if (tag) {
    const isPopular = await isPopularTag(genre, tag)
    
    if (isPopular && page <= 3) {
      // 事前キャッシュから配信
      const cacheKey = `ranking-${genre}-${period}-tag-${tag}`
      const cached = await kv.get(cacheKey) as { items: any[] }
      
      if (cached) {
        const startIdx = (page - 1) * 100
        const pageItems = cached.items.slice(startIdx, startIdx + 100)
        
        // ランク番号を調整
        const adjustedItems = pageItems.map((item, idx) => ({
          ...item,
          rank: startIdx + idx + 1
        }))
        
        return NextResponse.json(adjustedItems)
      }
    }
    
    // 4ページ目以降、または非人気タグは動的取得
    const items = await fetchDynamicTagRanking(genre, period, tag, page)
    return NextResponse.json(items)
  }
}
```

### 2. Client 側の対応

```typescript
// app/client-page.tsx
const loadMoreItems = async () => {
  // 人気タグの4ページ目以降は動的取得になることを考慮
  const response = await fetch(`/api/ranking?page=${currentPage + 1}`)
  const data = await response.json()
  
  // エラーハンドリング
  if (data.error === 'Page limit exceeded') {
    setHasMore(false)
    return
  }
  
  setRankingData([...rankingData, ...data])
  setCurrentPage(currentPage + 1)
  setHasMore(data.length === 100)
}
```

### 3. Cron Job は現状維持

```typescript
// 人気タグは引き続き300件まで事前キャッシュ
// 4ページ目以降はオンデマンド対応
```

## メリット・デメリット

### メリット
- ✅ 機能退化を防げる（500件まで表示可能を維持）
- ✅ 人気タグの初速は速い（最初の300件）
- ✅ KVストレージの増加を抑制
- ✅ 段階的な実装が可能

### デメリット
- ❌ 実装が複雑（ハイブリッド管理）
- ❌ 4ページ目以降は遅延あり
- ❌ コードの保守性がやや低下

## 実装優先順位

1. **短期対応**: 現状維持（ユーザー影響を観察）
2. **中期対応**: ハイブリッド拡張方式を実装
3. **長期対応**: ユーザー行動データを元に最適化

## まとめ

「人気になったら見れる範囲が狭まる」という逆転現象を防ぐため、**事前キャッシュ＋オンデマンド拡張**のハイブリッド方式が最適。

これにより：
- 人気タグ: 高速な300件 + 必要に応じて500件まで
- 通常タグ: 従来通り500件まで可能
- 一貫したユーザー体験を維持