# NGフィルタリング二重適用の分析

## 現在の実装
- **KV書き込み時のみ**フィルタリング（Cron job/GitHub Actions実行時）

## 二重適用のメリット・デメリット

### メリット
1. **リアルタイムNG反映** - 管理画面でNGリストを更新すると即座に反映
2. **セキュリティ強化** - KV汚染やバグがあっても表示時に再フィルタリング
3. **柔軟性** - ユーザー別のNGリストも実装可能

### デメリット
1. **パフォーマンス低下**
   - 300件の配列を毎回フィルタリング
   - NGリスト取得のKV読み込み（追加のネットワークリクエスト）

## パフォーマンス影響の計算

### 1回のフィルタリング処理
```
- NGリスト取得: ~50ms (KV読み込み)
- フィルタリング: ~5ms (300件のループ処理)
- 合計: ~55ms
```

### 影響を受けるリクエスト
- Server Component（初回レンダリング）: +55ms
- API呼び出し（クライアント側）: +55ms

### 現実的な影響
- **初回表示**: 現在より55ms遅延
- **ジャンル切り替え**: APIキャッシュがない場合のみ影響

## 推奨実装

### オプション1: 軽量チェックのみ（推奨）
```typescript
// APIレスポンス時に軽量チェック
if (process.env.ENABLE_RUNTIME_NG_CHECK === 'true') {
  const ngVideoIds = await kv.get('ng-quick-check-ids') || []
  items = items.filter(item => !ngVideoIds.includes(item.id))
}
```

### オプション2: キャッシュ付き完全フィルタリング
```typescript
// NGリストをメモリキャッシュ
let ngListCache = null
let ngListCacheTime = 0

async function getCachedNGList() {
  if (Date.now() - ngListCacheTime > 60000) { // 1分キャッシュ
    ngListCache = await getNGList()
    ngListCacheTime = Date.now()
  }
  return ngListCache
}
```

### オプション3: 非同期更新（最も軽量）
- 表示はそのまま行う
- バックグラウンドでNGチェック
- 問題があれば次回から非表示

## 結論
- **通常は不要** - KV書き込み時のフィルタリングで十分
- **必要な場合** - 軽量チェックのみ実装（動画IDのSetでO(1)チェック）
- **フルフィルタリング** - 管理者のみ、または緊急時のみ