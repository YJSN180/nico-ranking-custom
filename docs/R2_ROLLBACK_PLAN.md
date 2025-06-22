# R2移行ロールバック計画

## 概要

R2移行で問題が発生した場合の迅速なロールバック手順。

## 問題検知のトリガー

以下のいずれかが発生した場合、即座にロールバックを実行：

1. **パフォーマンス劣化**
   - レスポンスタイムが500ms以上に悪化
   - エラー率が1%を超える
   - タイムアウトエラーの頻発

2. **データ整合性エラー**
   - ランキングデータが表示されない
   - データ形式エラー
   - 更新が反映されない

3. **コスト超過**
   - R2の無料枠を超過する兆候
   - 予期しない課金の発生

## ロールバック手順

### 🚨 緊急ロールバック（1分以内）

```bash
# 1. 現在のWorkerをKVバージョンに戻す
wrangler deploy -c wrangler.toml

# 2. DNSが反映されるまで待機（通常1-2分）
```

### 📊 段階的ロールバック（5分以内）

```bash
# 1. 現在のWorker設定を確認
wrangler tail

# 2. KVバージョンのWorkerをデプロイ
wrangler deploy workers/api-gateway-simple.ts

# 3. デプロイ確認
curl -I https://nico-rank.com/api/ranking?genre=all | grep X-Data-Source
# Expected: X-Data-Source: kv-cache

# 4. GitHub Actionsの設定を戻す
git revert HEAD --no-edit  # R2書き込み追加コミットを取り消し
git push
```

### 🔧 完全ロールバック（30分以内）

1. **GitHub Actionsの修正**
   ```yaml
   # .github/workflows/update-ranking-parallel.yml から
   # Write to R2 ステップを削除
   ```

2. **環境変数のクリーンアップ**
   ```bash
   # GitHub Secretsから削除
   gh secret delete R2_ACCESS_KEY_ID
   gh secret delete R2_SECRET_ACCESS_KEY
   ```

3. **R2データの保持**（将来の再試行用）
   ```bash
   # R2バケットは削除せず、データは残しておく
   # 課金を避けるため、新規書き込みのみ停止
   ```

## ロールバック後の検証

### 1. 機能確認

```bash
# APIレスポンスチェック
curl https://nico-rank.com/api/ranking?genre=all | jq .

# ヘッダー確認
curl -I https://nico-rank.com/api/ranking?genre=all

# 複数ジャンルのテスト
for genre in all game anime; do
  echo "Testing $genre..."
  curl -s https://nico-rank.com/api/ranking?genre=$genre | jq '.items | length'
done
```

### 2. パフォーマンス確認

```bash
# パフォーマンステスト実行
RUN_ACTUAL_TEST=true npx tsx scripts/r2-performance-test.ts
```

### 3. モニタリング

- Cloudflare Analytics でエラー率を確認
- Worker Logs でエラーログを確認
- KV使用量が正常範囲内か確認

## 事後対応

### 問題分析

1. **ログ収集**
   ```bash
   # Worker ログ
   wrangler tail --format json > rollback-logs.json
   
   # GitHub Actions ログ
   gh run list --limit 10
   gh run view <RUN_ID> --log
   ```

2. **原因特定**
   - R2接続エラー
   - データ形式の不一致
   - 権限設定の問題
   - ネットワーク遅延

3. **改善策の検討**
   - より小さなデータで段階的移行
   - キャッシュ戦略の見直し
   - エラーハンドリングの強化

### 再試行の準備

1. **問題の修正**
2. **ステージング環境でのテスト**
3. **段階的な再デプロイ計画**

## 連絡先

問題発生時の連絡先：
- 開発チーム: [Slack/Discord]
- Cloudflare サポート: [必要に応じて]

## チェックリスト

ロールバック実行時のチェックリスト：

- [ ] Workerをロールバック
- [ ] APIレスポンスを確認
- [ ] エラー率を確認
- [ ] GitHub Actionsを修正
- [ ] ユーザー影響を確認
- [ ] 問題の原因を記録
- [ ] 改善策を検討