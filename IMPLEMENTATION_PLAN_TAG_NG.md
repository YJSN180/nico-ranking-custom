# タグNGシステム実装計画

## 概要
ユーザーNGシステムにタグ別NG機能を追加し、ロックタグとユーザータグの両方でフィルタリングできるようにする。既存のエクスポート済みNGリストとの後方互換性を保つ。

## UI設計

### NGリスト設定画面の新セクション（「投稿者」の下に追加）

```
🚫 タグ

◯ ロックタグ  ◯ ユーザータグ  ◉ 両方

◯ 完全一致  ◉ 部分一致

┌─────────────────────────────────────────────────┐
│ 🔒 ゲーム (ロック・完全) [×]                     │
│ 🔖 実況プレイ (ユーザー・部分) [×]              │
│ 🔒 東方 (ロック・部分) [×]                      │
│ 🔖 歌ってみた (ユーザー・完全) [×]              │
└─────────────────────────────────────────────────┘

[タグ名を入力_________________] [追加]
```

## データ構造（後方互換性あり）

### 拡張されたNGListインターフェース
```typescript
interface ExtendedNGList extends NGList {
  // 既存のフィールドは維持
  videoIds: string[]
  videoTitles: { exact: string[], partial: string[] }
  authorIds: string[]
  authorNames: { exact: string[], partial: string[] }
  derivedVideoIds?: string[]
  
  // 新規追加（オプショナル）
  tags?: {
    locked: { exact: string[], partial: string[] }
    user: { exact: string[], partial: string[] }
    both: { exact: string[], partial: string[] }
  }
}
```

### バックアップ形式（バージョン1.1.0）
```json
{
  "version": "1.1.0",  // 1.0.0から更新
  "exportDate": "2025-07-23T...",
  "exportSource": "settings-applied",
  "ngList": {
    // 既存フィールド
    "videoIds": [...],
    "videoTitles": {...},
    "authorIds": [...],
    "authorNames": {...},
    
    // 新規フィールド（オプショナル）
    "tags": {
      "locked": { "exact": [...], "partial": [...] },
      "user": { "exact": [...], "partial": [...] },
      "both": { "exact": [...], "partial": [...] }
    }
  },
  "metadata": {
    "totalItems": 100,
    "categoryBreakdown": {
      // 既存
      "videoIds": 10,
      "videoTitlesExact": 5,
      "videoTitlesPartial": 5,
      "authorIds": 10,
      "authorNamesExact": 5,
      "authorNamesPartial": 5,
      
      // 新規（オプショナル）
      "tagsLockedExact": 3,
      "tagsLockedPartial": 2,
      "tagsUserExact": 4,
      "tagsUserPartial": 3,
      "tagsBothExact": 2,
      "tagsBothPartial": 1
    },
    "appVersion": "1.0.0"
  }
}
```

## 実装手順

### Phase 1: データ構造の拡張（1-2日）
1. ✅ 拡張型定義の作成
2. マイグレーション関数の実装
3. 型ガードの実装

### Phase 2: フィルタリングロジック（1日）
1. `lib/filter-with-ng-list.ts`の拡張
2. タグフィルタリング関数の実装
3. 既存のフィルタリングとの統合

### Phase 3: UI実装（2-3日）
1. 設定モーダルコンポーネントの更新
2. タグ入力・表示コンポーネントの作成
3. 状態管理の実装

### Phase 4: バックアップ機能（1日）
1. エクスポート機能の更新
2. インポート機能の更新（後方互換性）
3. 重複検出の拡張

### Phase 5: テストとドキュメント（1日）
1. ユニットテストの追加
2. E2Eテストの更新
3. ユーザーガイドの作成

## 技術的考慮事項

### 後方互換性の保証
- 既存のv1.0.0バックアップファイルを読み込み可能
- tagsフィールドはオプショナル
- 古いバージョンのインポート時は自動マイグレーション

### パフォーマンス
- タグフィルタリングは既存のフィルタリングと同時実行
- 部分一致検索の最適化（必要に応じて）

### セキュリティ
- タグ名の入力値検証
- XSS対策（React自動エスケープ）

## テスト計画

### ユニットテスト
- マイグレーション関数
- フィルタリング関数
- バックアップ/リストア

### E2Eテスト
- タグ追加/削除
- フィルタリング動作
- バックアップ/リストア

### 手動テスト
- 後方互換性（v1.0.0ファイル）
- UI操作性
- パフォーマンス

## リリース計画
1. feature/tag-ng-systemブランチで開発
2. PRレビュー
3. ステージング環境でテスト
4. 本番デプロイ（Blue/Green）

## 推定工期
- 開発: 6-8日
- テスト: 2日
- 合計: 8-10日