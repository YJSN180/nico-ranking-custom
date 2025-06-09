# ダークモード背景色修正

## 問題
ダークモードを選択しても、メインコンテンツエリアの背景が白いままになっている。

## 原因
1. `page.tsx`で`main`タグに固定のグラデーション背景が設定されていた
   ```css
   background: 'linear-gradient(180deg, #f0f2f5 0%, #ffffff 100%)'
   ```

2. CSS変数が正しく適用されていない部分があった

## 修正内容

### 1. page.tsx
- `main`タグの背景を`var(--background-color)`に変更
- これにより、テーマに応じて背景色が変わるように

### 2. globals.css
- `body`タグには既に正しく`background-color: var(--background-color)`が設定済み
- 各テーマごとに適切な背景色が定義済み：
  - ライトモード: `#ffffff`
  - ダークモード: `#121212`
  - ダークブルー: `#0d1b2a`

### 3. コンポーネントの背景色階層
- body: `var(--background-color)` - 最背面
- main: `var(--background-color)` - ページ全体
- ランキングアイテム: `var(--surface-color)` - 個別のカード

## 検証
CSS変数による背景色設定が正しく機能することを確認するテストを追加：
- `__tests__/unit/dark-mode-background-page.test.tsx`

## 結果
これにより、ダークモードとダークブルーテーマで適切な暗い背景色が表示されるようになります。