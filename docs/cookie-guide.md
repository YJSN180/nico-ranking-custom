# ニコニコ動画のCookie取得ガイド

## 必要なCookie情報の確認方法

### 1. ブラウザでニコニコ動画にログイン
1. https://www.nicovideo.jp/ にアクセス
2. アカウントでログイン
3. センシティブコンテンツの表示設定を確認（アカウント設定 > 表示設定）

### 2. 開発者ツールでCookieを確認

#### Chrome/Edge の場合：
1. F12キーまたは右クリック→「検証」で開発者ツールを開く
2. 「Application」タブを選択
3. 左側メニューの「Storage」→「Cookies」→「https://www.nicovideo.jp」を選択
4. 以下のCookieを探す：

#### 必要なCookie：
- **nicosid**: セッションID（例: 1234567890.987654321）
- **user_session**: ユーザーセッション（例: user_session_12345678_...）
- **sensitive_material_status**: センシティブ設定（値: accept）

#### Firefox の場合：
1. F12キーで開発者ツールを開く
2. 「ストレージ」タブを選択
3. 「Cookie」→「https://www.nicovideo.jp」を選択

### 3. Cookie値の確認例

```
nicosid: 1748534853.1685979985
user_session: user_session_12345678_abcdef1234567890abcdef1234567890abcdef1234567890
sensitive_material_status: accept
```

## セキュリティ上の注意

⚠️ **重要**: これらのCookie値は個人のセッション情報です。
- 他人と共有しない
- 公開リポジトリにコミットしない
- 環境変数として管理する

## 環境変数の設定方法

### ローカル開発（.env.local）
```bash
NICO_SESSION_ID=your_nicosid_value
NICO_USER_SESSION=your_user_session_value
```

### Vercel環境
1. Vercelダッシュボード → Settings → Environment Variables
2. 以下を追加：
   - `NICO_SESSION_ID`
   - `NICO_USER_SESSION`