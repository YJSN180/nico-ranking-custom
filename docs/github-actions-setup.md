# GitHub Actions セットアップガイド

このドキュメントでは、GitHub Actionsを使用して定期的にニコニコ動画のランキングデータと人気タグを取得し、Vercel KVに保存する方法を説明します。

## 概要

Vercelのサーバーは日本国外のIPアドレスを使用するため、ニコニコ動画からジオブロックされます。この問題を解決するため、GitHub ActionsでGooglebot UAを使用してデータを取得し、Vercel KVに保存します。

## 仕組み

1. **GitHub Actions** - 毎時15分と45分に実行
2. **Googlebot UA** - ジオブロックを回避
3. **ランキングデータ取得** - 23ジャンルのランキングと人気タグ（trendTags）を取得
4. **Vercel KV保存** - APIエンドポイント経由でKVに保存
5. **サイト表示** - KVから人気タグを含むデータを読み取って表示

## セットアップ手順

### 1. GitHub Secretsの設定

リポジトリの Settings → Secrets and variables → Actions で以下のシークレットを追加：

#### CRON_SECRET（必須）
- ランダムな文字列を生成して設定
- 例: `openssl rand -base64 32`
- API認証に使用

#### VERCEL_URL（オプション）
- Vercelのデプロイメント URL（例: `nico-ranking-custom.vercel.app`）
- 設定しない場合はデフォルト値が使用される

### 2. Vercel環境変数の設定

Vercelのダッシュボードで以下の環境変数を設定：

```
CRON_SECRET = [GitHubと同じ値]
```

### 3. GitHub Actionsの有効化

1. リポジトリの Actions タブに移動
2. "I understand my workflows, go ahead and enable them" をクリック
3. 左サイドバーから "Ranking Scraper" を選択
4. "Run workflow" ボタンをクリックして手動実行（テスト）

## 動作確認

### 1. GitHub Actions の実行確認

Actions タブで "Ranking Scraper" ワークフローの実行状況を確認：
- ✅ 成功: データ取得とKV保存が完了
- ❌ 失敗: ログを確認してエラーを調査

### 2. KVデータの確認

以下のURLでKVに保存されたデータを確認（認証が必要）：

```
https://[your-domain]/api/kv-update?genre=game
```

ヘッダーに `X-Cron-Secret: [your-secret]` を含める

### 3. サイトでの表示確認

1. サイトにアクセス
2. ジャンルを選択
3. 人気タグが表示されることを確認

## トラブルシューティング

### GitHub Actions が失敗する

1. **Secrets が正しく設定されているか確認**
   - CRON_SECRET が設定されている
   - スペースや改行が含まれていない

2. **ログを確認**
   - Actions タブから失敗したワークフローを開く
   - "Run scraper" ステップのログを確認

### 人気タグが表示されない

1. **KVデータを確認**
   ```bash
   curl -H "X-Cron-Secret: [your-secret]" \
        https://[your-domain]/api/kv-update
   ```

2. **GitHub Actions が実行されているか確認**
   - 最後の実行時刻を確認
   - 手動実行してテスト

3. **フォールバックデータが表示される場合**
   - KVからのデータ取得に失敗している
   - Vercel KVの接続設定を確認

## データ構造

### KVに保存されるデータ

```typescript
{
  items: RankingItem[],       // ランキングアイテム
  popularTags: string[],      // 人気タグ（trendTags）
  updatedAt: string,          // 更新日時
  scrapedAt: string          // スクレイピング日時
}
```

### キー形式

```
ranking-{genre}  // 例: ranking-game, ranking-anime
```

## 実行スケジュール

- **定期実行**: 毎時15分と45分（UTC）
- **手動実行**: Actions タブから "Run workflow" で実行可能
- **TTL**: 1時間（3600秒）

## 注意事項

1. **レート制限**: 各ジャンル間に1秒の遅延を設定
2. **エラーハンドリング**: 失敗したジャンルはスキップして継続
3. **バッチ更新**: 全ジャンルを一度に更新してAPI呼び出しを削減
4. **フォールバック**: KV更新が失敗した場合は個別更新にフォールバック