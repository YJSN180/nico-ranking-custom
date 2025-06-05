# net::ERR_INSUFFICIENT_RESOURCES エラーの原因分析

## 問題の概要
ジャンルやタグを頻繁に切り替えると `net::ERR_INSUFFICIENT_RESOURCES` エラーが発生する。これはブラウザのリソース（メモリ、ネットワーク接続、ストレージ）が枯渇することを示している。

## 主な原因

### 1. ストレージの累積（最も可能性が高い）

#### 現在の実装
- ジャンル/タグ切り替え時に `localStorage` と `sessionStorage` の**両方**に状態を保存
- キー形式: `ranking-state-{genre}-{period}-{tag|none}`
- 保存データサイズ:
  - 100アイテム: 約1.5KB
  - 300アイテム: 約4.2KB  
  - 500アイテム: 約7KB

#### 問題点
- **クリーンアップ不足**: 新しい状態に切り替えても古いデータは削除されない
- **重複保存**: localStorage と sessionStorage の両方に同じデータを保存（2倍の容量）
- **累積計算**:
  - 13ジャンル × 2期間 = 26通り
  - 各ジャンルに20個のタグがあると仮定: 520通り
  - 合計: 546キー × 2ストレージ = 約1.7MB
  - 頻繁な切り替えでさらに増加

#### クリーンアップの現状
- 1時間以上経過したデータは**読み込み時**のみ削除
- sessionStorageは復元成功後1秒で削除（ただし復元しない場合は残る）
- **切り替え時のクリーンアップなし**

### 2. リアルタイム統計APIの大量リクエスト

#### 現在の実装
```javascript
// 最大500アイテムを10個ずつバッチ処理
// = 50リクエスト/分
// = 3000リクエスト/時
```

#### 問題点
- ジャンル切り替え時に新しいリクエストセットが即座に開始
- 古いリクエストのキャンセルなし
- 進行中のリクエストが累積する可能性

### 3. 画像の大量読み込み

#### 現在の実装
- サムネイル画像: 160×90 (デスクトップ) / 120×67 (モバイル)
- 投稿者アイコン: 24×24
- Next.js Imageコンポーネント使用（最適化あり）

#### 潜在的な問題
- `loading="lazy"` が明示的に設定されていない
- 500アイテム表示時 = 最大1000枚の画像（サムネ + アイコン）
- ブラウザの同時接続数制限に到達する可能性

### 4. スクロールイベントの頻繁な発火

#### 現在の実装
```javascript
// スクロール時に1秒デバウンスで状態保存
// 100px以上のスクロールで保存
```

#### 潜在的な問題
- スクロール中に頻繁にストレージ書き込みが発生
- デバウンス時間内でも累積する可能性

## 推奨される修正

### 1. ストレージ管理の改善（優先度: 高）

```typescript
// 1. 切り替え時に古いデータをクリーンアップ
const cleanupOldStates = () => {
  const currentKey = `ranking-state-${config.genre}-${config.period}-${config.tag || 'none'}`
  const oneHourAgo = Date.now() - 3600000
  
  // localStorage のクリーンアップ
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('ranking-state-') && key !== currentKey) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}')
        if (!data.timestamp || data.timestamp < oneHourAgo) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  })
  
  // sessionStorage も同様に
}

// 2. 保存サイズの制限
const MAX_STORAGE_SIZE = 500 * 1024 // 500KB
const getCurrentStorageSize = () => {
  let size = 0
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('ranking-state-')) {
      size += (localStorage.getItem(key) || '').length
    }
  })
  return size
}

// 3. LRU (Least Recently Used) 方式での削除
```

### 2. APIリクエストの最適化（優先度: 高）

```typescript
// 1. AbortController でリクエストキャンセル
const abortControllerRef = useRef<AbortController>()

useEffect(() => {
  // 既存のリクエストをキャンセル
  if (abortControllerRef.current) {
    abortControllerRef.current.abort()
  }
  
  abortControllerRef.current = new AbortController()
  
  // fetch時にsignalを追加
  fetch(url, { signal: abortControllerRef.current.signal })
})

// 2. リクエスト数の制限
const MAX_CONCURRENT_REQUESTS = 5
```

### 3. 画像読み込みの最適化（優先度: 中）

```typescript
// 1. 明示的なlazy loading
<Image
  src={item.thumbURL}
  loading="lazy"
  placeholder="blur"
  blurDataURL="..." // プレースホルダー画像
/>

// 2. Intersection Observer での遅延読み込み
```

### 4. メモリリークの防止（優先度: 中）

```typescript
// 1. クリーンアップ関数の確実な実行
// 2. イベントリスナーの適切な削除
// 3. setInterval/setTimeout の確実なクリア
```

## 即時対応可能な修正

1. **ストレージのクリーンアップ追加**（最重要）
2. **sessionStorageの使用を停止**（localStorageのみで十分）
3. **保存データサイズの削減**（itemIdsを保存しない）
4. **リアルタイム更新の頻度削減**（1分→3分）

これらの修正により、リソース枯渇エラーを大幅に削減できると考えられる。