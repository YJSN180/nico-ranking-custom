# センシティブ動画表示修正 - 実装完了

## 問題の概要
- センシティブ動画（デバイス視聴制限動画）がランキングに表示されていなかった
- 特に「機動戦士Gundam G糞uuuuuuX」や「静電気ドッキリを仕掛けるタクヤさん」などの動画が欠けていた
- 「例のソレ」（R-18）ジャンルが正しく表示されていなかった

## 実施した修正

### 1. ジャンルリストの修正 (`types/ranking-config.ts`)
- 存在しない`d2um7mc4`ジャンルIDを削除
- `r18`ジャンルのラベルを「R-18」から「例のソレ」に変更
- 不足していたジャンル（`traveling_outdoor`, `vehicle`, `commentary_lecture`）を追加

### 2. HTMLスクレイピングの更新 (`lib/complete-hybrid-scraper.ts`)
- ニコニコ動画が新しいサーバーサイドレンダリング方式に移行したことを発見
- 全ジャンルでmeta tagの`server-response`からデータを取得するように変更
- R18ジャンルの不要なブロッキングコードを削除
- `parseRankingFromMeta`関数を追加して、全ジャンルで統一的にデータを取得

### 3. 主な技術的変更点
```typescript
// 旧: HTMLから動画IDを抽出
const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g

// 新: meta tagからJSONデータを取得
const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
const jsonData = JSON.parse(decodedData)
const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data?.items
```

## 結果
- ✅ 全18ジャンルが正常に動作（各100件のランキングデータを取得）
- ✅ センシティブ動画が正しく表示される
  - 「機動戦士Gundam GQuuuuuuX」: ランキング34位
  - 「静電気ドッキリを仕掛けるタクヤさん」: ランキング40位
- ✅ 「例のソレ」（R-18）ジャンルが正しく表示される
- ✅ TypeScriptとESLintのチェックをパス

## 技術的発見
ニコニコ動画は最近、ランキングページの実装を大幅に変更し、従来のHTMLベースのレンダリングから、サーバーサイドでデータを生成してmeta tagに埋め込む方式に移行した。この変更により、nvAPIを使わなくても全ての動画（センシティブ動画を含む）のデータが取得できるようになった。