# Chrome DevTools MCP セットアップガイド

## 1. MCPサーバーのインストール

```bash
# npmでインストール
npm install -g @modelcontextprotocol/server-puppeteer

# または、Claude Codeの設定ファイルに追加
```

## 2. Claude Codeの設定

Claude Codeの設定ファイル（通常は `~/.claude/claude_desktop_config.json`）を編集：

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "node",
      "args": [
        "/path/to/node_modules/@modelcontextprotocol/server-puppeteer/dist/index.js"
      ]
    }
  }
}
```

または、WSL環境の場合：

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-puppeteer"
      ]
    }
  }
}
```

## 3. 設定の適用

1. Claude Codeを完全に終了
2. 設定ファイルを保存
3. Claude Codeを再起動

## 4. 確認方法

Claude Codeで以下のようなコマンドが使えるようになります：
- ブラウザの起動
- ページの読み込み
- DevToolsでのネットワーク監視
- JavaScriptの実行
- スクリーンショットの取得

## トラブルシューティング

### Windows + WSLの場合
```bash
# WSL内でChromeをインストール
sudo apt update
sudo apt install -y chromium-browser

# または、Windows側のChromeを使う設定
export PUPPETEER_EXECUTABLE_PATH="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
```

### 権限エラーの場合
```bash
# npmのグローバルディレクトリを確認
npm config get prefix

# 権限を修正
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```