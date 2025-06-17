# Archive Scripts

このディレクトリには、開発過程で作成された実験的なスクリプトや分析ツールが保存されています。
これらは現在のシステムでは直接使用されていませんが、今後の開発や問題解決の参考になる可能性があるため保存しています。

## カテゴリ別ファイル一覧

### API分析・テスト系
ニコニコ動画のAPI仕様を理解するために作成されたスクリプト群

- `analyze-niconico-algorithm.ts` - ランキングアルゴリズムの分析
- `debug-api-response.ts` - APIレスポンスのデバッグ
- `test-nvapi-*.ts` - NVAPI関連のテスト
- `test-direct-api.ts` - 直接API呼び出しテスト
- `test-mobile-nvapi.ts` - モバイルAPI テスト
- `test-nicochart-api.ts` - NicoChart API テスト

### タグランキング取得系
タグ別ランキング取得方法の実験・検証

- `get-tag-rankings-*.ts` - 各種タグランキング取得方法
- `test-tag-ranking-*.ts` - タグランキング関連テスト
- `debug-tag-ranking.ts` - タグランキングのデバッグ
- `analyze-tag-rss.ts` - タグRSSの分析

### HTML/データ分析系
HTML構造やデータ形式の分析

- `analyze-html-structure.ts` - HTML構造分析
- `deep-html-analysis.ts` - 詳細なHTML分析
- `extract-*.ts` - 各種データ抽出スクリプト
- `analyze-remix-*.ts` - Remix関連の分析

### ジャンル関連
ジャンル別ランキングの調査・分析

- `analyze-genre-state.ts` - ジャンル状態の分析
- `check-genre-ids.ts` - ジャンルIDの確認
- `test-genre-behavior.ts` - ジャンル動作テスト
- `analyze-all-genres-tags.ts` - 全ジャンルのタグ分析

### 例のソレ（レイ・ソレ）ジャンル関連
特殊ジャンル「例のソレ」の取得方法調査

- `find-rei-sore-videos.ts` - 例のソレ動画の検索
- `get-reisore-*.ts` - 例のソレ関連の取得スクリプト
- `test-rei-sore-ranking.ts` - 例のソレランキングテスト

### 統合テスト系
システム全体のテスト

- `test-complete-system.ts` - 完全なシステムテスト
- `test-complete-integration.ts` - 統合テスト

### その他実験的スクリプト
- `test-with-puppeteer.ts` - Puppeteerを使用した分析
- `test-proxy-*.ts` - プロキシ関連のテスト
- `debug-*.ts` - 各種デバッグスクリプト

## 注意事項

- これらのスクリプトは実験的なものであり、現在のシステムでは使用されていません
- 実行する場合は、APIの負荷やレート制限に注意してください
- 一部のスクリプトは古いAPIエンドポイントを参照している可能性があります

## 保存理由

1. **API仕様の理解**: ニコニコ動画のAPI仕様を理解する過程が記録されている
2. **問題解決の参考**: 将来的に同様の問題が発生した際の参考資料
3. **実験結果の記録**: 各種アプローチの成功/失敗が記録されている