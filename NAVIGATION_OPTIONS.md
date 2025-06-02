# 動画ページへの遷移オプション

## 現在の実装
- 通常の`<a>`タグでニコニコ動画に直接遷移
- ブラウザバックで戻ると、sessionStorageにより状態が復元される

## 改善オプション

### 1. 新しいタブで開く（推奨）
```jsx
<a 
  href={`https://www.nicovideo.jp/watch/${item.id}`}
  target="_blank"
  rel="noopener noreferrer"
>
```
**メリット**：
- ランキングページが開いたまま維持される
- 複数の動画を比較しやすい
- スクロール位置やフィルタ状態を失わない

**デメリット**：
- タブが増える
- モバイルでは使いづらい場合がある

### 2. Ctrl/Cmd+クリックの案内
現在の実装のまま、UIに「Ctrl+クリックで新しいタブで開く」という案内を追加

### 3. 右クリックメニューの活用
ユーザーが自分で「新しいタブで開く」を選択できることを前提とする

### 4. プレビュー機能（高度）
- モーダルで動画の概要を表示
- 埋め込みプレーヤー（ニコニコ動画のAPIが必要）

## 推奨実装

最もシンプルで効果的なのは、`target="_blank"`を追加することです：

```typescript
// components/ranking-item.tsx の修正
<a
  href={`https://www.nicovideo.jp/watch/${item.id}`}
  target="_blank"
  rel="noopener noreferrer"
  style={{ 
    color: '#0066cc', 
    textDecoration: 'none',
    // ... 他のスタイル
  }}
>
  {item.title}
</a>
```

これにより：
- ユーザーはランキングページを離れずに動画を視聴できる
- 複数の動画を開いて比較できる
- sessionStorageの恩恵を最大限に活用できる