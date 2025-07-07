# Codecov Setup Guide

## 概要

このドキュメントでは、GitHub ActionsでCodecovを使用してVitestのカバレッジレポートをアップロードする設定方法を説明します。

## 1. Codecovトークンの設定

### GitHub Secretsへの登録

#### 方法1: GitHub CLIを使用（推奨）

```bash
# GitHub CLIで認証
gh auth login

# Codecovトークンを設定
echo "your-codecov-token" | gh secret set CODECOV_TOKEN --repo owner/repo

# 設定を確認
gh secret list --repo owner/repo
```

#### 方法2: WebUIから設定

1. GitHubリポジトリの設定ページへアクセス
2. 左メニューから「Secrets and variables」→「Actions」を選択
3. 「New repository secret」をクリック
4. 以下の情報を入力：
   - **Name**: `CODECOV_TOKEN`
   - **Secret**: Codecovから取得したトークン
5. 「Add secret」をクリック

## 2. Vitestカバレッジ設定

### vitest.config.ts

```typescript
coverage: {
  provider: 'v8',
  reporter: process.env.CI ? ['text', 'json', 'lcov', 'json-summary'] : ['text', 'json', 'html'],
  reportsDirectory: './coverage',
  all: false,
  clean: true,
}
```

### 重要な設定

- **reporter**: CI環境では `lcov` と `json` フォーマットが必要
- **reportsDirectory**: カバレッジファイルの出力先を指定
- **clean**: 前回のカバレッジファイルを削除して正確な結果を取得

## 3. GitHub Actions設定

### .github/workflows/unified-ci.yml

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v5
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    directory: ./coverage
    files: ./coverage/lcov.info,./coverage/coverage-final.json
    flags: unittests
    name: codecov-umbrella
    fail_ci_if_error: false
    verbose: true
```

## 4. トラブルシューティング

### カバレッジアップロードが失敗する場合

1. **トークンの確認**
   - GitHub Secretsに `CODECOV_TOKEN` が正しく設定されているか確認
   - トークンの前後に余分なスペースがないか確認

2. **カバレッジファイルの確認**
   - CI実行時に `coverage/lcov.info` と `coverage/coverage-final.json` が生成されているか確認
   - ファイルサイズが0でないか確認

3. **Codecov Action のデバッグ**
   - `verbose: true` を設定して詳細ログを確認
   - `fail_ci_if_error: false` に設定して他のエラーと切り分け

### よくある問題

1. **「Error: Codecov token not found」**
   - GitHub Secretsにトークンが設定されていない
   - シークレット名が正しくない（`CODECOV_TOKEN` である必要がある）

2. **「No coverage files found」**
   - Vitestのカバレッジ設定が正しくない
   - テストが実行されていない
   - シャード実行時にカバレッジファイルが正しくマージされていない

3. **「Upload failed」**
   - ネットワークの一時的な問題
   - Codecovサービスの一時的な問題
   - トークンが無効または期限切れ

## 5. 確認方法

### ローカルでのテスト

```bash
# カバレッジを生成
npm run test:coverage

# カバレッジファイルの確認
ls -la coverage/
cat coverage/lcov.info | head -20
```

### CI実行後の確認

1. GitHub Actionsのログで「Upload coverage to Codecov」ステップを確認
2. Codecovダッシュボード（https://app.codecov.io/）でレポートを確認
3. PRにCodecovのコメントが表示されることを確認

## 6. Codecov v23+ の変更点

### カレンダーバージョニング（CalVer）への移行

Codecov v23以降では、バージョニング体系が変更されました：
- 新フォーマット: `v[yy].[mm].[dd]`
- 例: `v23.11.2` = 2023年11月2日のリリース

### リリース体系の変更
- 月次リリースサイクル
- 4つの主要サービス：Gateway、API、Worker、Gazebo
- 各サービスの変更履歴はGitHubリポジトリの「releases」タブで確認可能

## 7. 参考リンク

- [Codecov Documentation](https://docs.codecov.com/)
- [Codecov GitHub Action](https://github.com/codecov/codecov-action)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html)
- [Codecov Changelog](https://docs.codecov.com/changelog/changelog-update-v23xxx-and-later)