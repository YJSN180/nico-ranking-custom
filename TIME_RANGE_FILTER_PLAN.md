# 時間範囲フィルタリング機能 - 実装計画

## 概要
ランキング画面に投稿日時ベースのフィルタリング機能を追加し、ユーザーが特定期間内の動画のみを表示できるようにする。

## UI/UXデザイン

### 現在のUI構造
```
[RankingSelector] [TagSelector] [🏷️ タグ表示/非表示]
```

### 新しいUI構造

#### デスクトップ版（640px以上）
```
[RankingSelector] [TagSelector] 
[🏷️ タグ表示]  [⏰ 過去24時間 ▼]
```

#### モバイル版（640px以下）
```
[RankingSelector] 
[TagSelector]
[🏷️ タグ] [⏰ 24h ▼]
```

## フィルターオプション

| 値 | ラベル | 短縮ラベル | 説明 |
|---|---|---|---|
| all | すべて表示 | 全て | フィルターなし（デフォルト） |
| 24h | 過去24時間 | 24h | 24時間以内の動画 |
| 1w | 過去1週間 | 1w | 7日前まで |
| 1m | 過去1ヶ月 | 1m | 30日前まで |

## 技術仕様

### データフロー
```
[サーバーデータ (500件)]
    ↓
[NGフィルタリング]
    ↓
[時間範囲フィルタリング] ← 新機能
    ↓
[ページネーション (100件/ページ)]
    ↓
[表示]
```

### フィルタリングロジック
```typescript
function filterByTimeRange(
  items: RankingItem[], 
  range: '24h' | '1w' | '1m' | 'all'
): RankingItem[] {
  if (range === 'all') return items
  
  const now = new Date()
  const cutoffDate = new Date()
  
  switch(range) {
    case '24h':
      cutoffDate.setHours(now.getHours() - 24)
      break
    case '1w':
      cutoffDate.setDate(now.getDate() - 7)
      break
    case '1m':
      cutoffDate.setMonth(now.getMonth() - 1)
      break
  }
  
  return items.filter(item => {
    if (!item.registeredAt) return true
    const itemDate = new Date(item.registeredAt)
    return itemDate >= cutoffDate
  })
}
```

## ページネーション戦略

### クライアント側ページネーション（動的ページ数）
- **利点**: 
  - 実装がシンプル
  - 即座に反映
  - 追加のAPIリクエスト不要
- **動作**: 
  - フィルタリング後の全データを保持
  - **ページ数は動的に変化**: `Math.ceil(フィルタ後件数 / 100)`
  - **フィルタ変更時は1ページ目にリセット**
  - 現在のページに応じて100件を切り出し

### ページ数変化の例
```
すべて表示: 500件 → 5ページ
過去24時間: 120件 → 2ページ  
過去1週間:  280件 → 3ページ
過去1ヶ月:  450件 → 5ページ
```

## 実装ステップ

### Phase 1: UIコンポーネント作成
- [ ] `TimeRangeFilter`コンポーネント作成
- [ ] ドロップダウンUI実装
- [ ] レスポンシブ対応

### Phase 2: フィルタリングロジック
- [ ] 日付比較関数の実装
- [ ] フィルタリング処理の追加
- [ ] 状態管理の実装

### Phase 3: 統合とテスト
- [ ] `client-page.tsx`への統合
- [ ] ページネーション調整
- [ ] パフォーマンステスト

## パフォーマンス最適化

- `useMemo`でフィルタリング結果をメモ化
- 選択状態をlocalStorageに保存
- デバウンス処理は不要（即座反映）

## UIフィードバック

### フィルター状態の表示
```
「500件中 120件を表示（過去24時間）」
```
- 総件数とフィルタ後件数を明示
- 現在のフィルター条件を表示
- ページネーションと連動

## エッジケース

1. **registeredAtがない動画**: すべて表示として扱う（フィルタリングから除外）
2. **フィルター後0件**: 「条件に一致する動画がありません」メッセージ表示
3. **大量データ**: 現状の500件制限で対応
4. **ページ番号超過**: フィルタリング後にページ数が減少した場合、自動的に1ページ目へ

## アクセシビリティ

- キーボードナビゲーション対応
- aria-label適切に設定
- 色コントラスト比WCAG AA準拠
- フォーカス管理

## 将来的な拡張

- カスタム期間設定
- 複数条件の組み合わせ
- サーバー側フィルタリング対応
- Virtual Scrolling導入