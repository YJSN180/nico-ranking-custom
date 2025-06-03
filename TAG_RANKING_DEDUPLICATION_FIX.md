# タグ別ランキング重複排除修正

## 問題の概要
「その他」ジャンルの人気タグ別ランキングで、300件のデータを事前キャッシュしているはずが、実際には100件程度しか表示されない問題が発生していました。

## 根本原因
ニコニコ動画のタグ別ランキングAPIは、ページネーション時に**同じ動画が複数ページに重複して出現する**ことがあります。

### データフローの例
```
ページ1: 100件取得 → NGフィルタリング → 90件
ページ2: 100件取得 → NGフィルタリング → 85件（うち10件は重複）
ページ3: 100件取得 → NGフィルタリング → 88件（うち20件は重複）

合計: 263件だが、重複を除くと実質150件程度
```

## 修正内容

### 1. app/api/cron/fetch/route.ts の修正

#### 通常のランキング取得部分（58-100行目）
```typescript
// 修正前
const allItems: RankingItem[] = []
// ...
allItems.push(...filteredItems)

// 修正後
const allItems: RankingItem[] = []
const seenVideoIds = new Set<string>() // 重複チェック用
// ...
// 重複を除外しながら追加
for (const item of filteredItems) {
  if (!seenVideoIds.has(item.id)) {
    seenVideoIds.add(item.id)
    allItems.push(item)
  }
}
```

#### タグ別ランキング取得部分（132-175行目）
同様に重複チェックロジックを追加：
```typescript
const seenVideoIds = new Set<string>() // 重複チェック用
// ...
// 重複を除外しながら追加
for (const item of filteredTagItems) {
  if (!seenVideoIds.has(item.id)) {
    seenVideoIds.add(item.id)
    allTagItems.push(item)
  }
}
```

### 2. 最大ページ数の増加
重複により実質的な取得件数が減るため、最大ページ数を5から8に増やしました：
```typescript
const maxPages = 8 // 重複を考慮して上限を増やす
const maxTagPages = 8 // 重複があるため上限を増やす
```

## 効果
- 重複動画が除外され、実際にユニークな300件の動画が取得できるようになります
- NGフィルタリングと重複除外の両方を考慮して、十分なページ数を取得します
- メモリ効率的なSet構造でO(1)の重複チェックを実現

## テスト
`__tests__/unit/tag-ranking-deduplication.test.ts` でユニットテストを実装：
- 重複データの正しい除外
- 300件到達までの適切なページネーション
- 最大ページ数での処理停止

## デバッグツール
- `scripts/debug-tag-ranking-duplication.ts`: 重複の詳細を調査
- `scripts/test-tag-ranking-actual-api.ts`: 実際のAPIの動作確認

## 今後の考慮事項
1. ニコニコ動画のAPIが将来的に重複を返さないように改善される可能性
2. 重複率のモニタリングにより、最大ページ数の調整が必要になる可能性
3. パフォーマンスへの影響は最小限（Setによる高速な重複チェック）