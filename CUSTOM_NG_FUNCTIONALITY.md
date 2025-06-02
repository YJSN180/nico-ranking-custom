# カスタムNG機能の仕様

## データ保存場所
- **localStorage** の `user-ng-list` キーに保存
- JSON形式で以下の構造：

```typescript
{
  videoIds: string[]              // 動画ID（例: "sm12345"）
  videoTitles: {
    exact: string[]              // 完全一致タイトル
    partial: string[]            // 部分一致タイトル
  }
  authorIds: string[]            // 投稿者ID
  authorNames: {
    exact: string[]              // 完全一致投稿者名
    partial: string[]            // 部分一致投稿者名
  }
  version: number                // データ構造バージョン（現在: 1）
  totalCount: number             // 総登録数
  updatedAt: string              // 最終更新日時
}
```

## NGリストがリセットされる条件

### 1. **ブラウザの設定からlocalStorageをクリア**
- ブラウザの設定 → プライバシーとセキュリティ → 閲覧履歴データの削除
- 「Cookie と他のサイトデータ」を削除するとlocalStorageも削除される

### 2. **ブラウザのデベロッパーツール**
- F12 → Application/Storage → Local Storage → サイトを右クリック → Clear

### 3. **プライベート/シークレットブラウジング**
- ウィンドウを閉じるとlocalStorageも削除される

### 4. **異なるドメイン/サブドメイン**
- `localhost:3000` と `your-app.vercel.app` は別扱い
- localStorageはドメインごとに独立

### 5. **データ構造のバージョン変更**
```typescript
// use-user-ng-list.ts
const CURRENT_VERSION = 1

// バージョンが異なる場合、古いデータは無視される
if (parsed.version === CURRENT_VERSION) {
  setNGList(parsed)
}
```

### 6. **手動リセット機能**
```typescript
// resetNGList関数を呼び出すと初期化
const resetNGList = useCallback(() => {
  const newList = {
    ...defaultNGList,
    updatedAt: new Date().toISOString(),
  }
  setNGList(newList)
  saveNGList(newList)
}, [saveNGList])
```

## リセットを防ぐ方法

### 1. **エクスポート/インポート機能の実装**
```typescript
// エクスポート
const exportNGList = () => {
  const data = JSON.stringify(ngList, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ng-list-${new Date().toISOString()}.json`
  a.click()
}

// インポート
const importNGList = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const data = JSON.parse(e.target.result as string)
    if (data.version === CURRENT_VERSION) {
      setNGList(data)
      saveNGList(data)
    }
  }
  reader.readAsText(file)
}
```

### 2. **クラウド同期（将来の拡張案）**
- ユーザーアカウント機能を追加
- サーバー側でNGリストを保存
- 複数デバイス間で同期

### 3. **定期バックアップ**
```typescript
// 定期的にNGリストをダウンロード促す
useEffect(() => {
  if (ngList.totalCount > 50) {
    // 50件以上登録されていたらバックアップを推奨
    console.info('NGリストが多くなっています。バックアップをお勧めします。')
  }
}, [ngList.totalCount])
```

## 現在の制限事項

1. **ストレージ容量**
   - localStorageは通常5-10MBまで
   - 数千件程度なら問題なし

2. **パフォーマンス**
   - Set を使用したO(1)のチェック
   - 部分一致は線形探索なので件数が多いと遅くなる可能性

3. **同期タイミング**
   - タブ間でのリアルタイム同期はなし
   - ページリロードで最新データを読み込み