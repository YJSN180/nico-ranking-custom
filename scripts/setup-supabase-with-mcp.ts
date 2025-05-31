// Supabase MCPを使用したセットアップガイド
console.log(`
=== Supabase MCPセットアップガイド ===

1. Claude Codeを再起動してMCP設定を読み込む
   - VS Codeを完全に閉じて再度開く
   - または、Claude Codeの設定をリロード

2. MCPが正しく設定されているか確認
   - Claude Codeで「mcp」コマンドを実行
   - "supabase"サーバーが表示されることを確認

3. Supabaseプロジェクトの情報を用意
   必要な情報:
   - Project URL: https://[プロジェクトID].supabase.co
   - Anon Key: 公開用のAPIキー
   
   これらは以下から取得できます:
   https://app.supabase.com → プロジェクト → Settings → API

4. データベースの初期化
   MCPが有効になったら、以下のコマンドでテーブルを作成:
   
   例: supabase_query "CREATE TABLE rei_sore_videos (...)"

5. 環境変数の設定
   .env.localファイルを作成し、以下を設定:
   
   NEXT_PUBLIC_SUPABASE_URL=あなたのSupabase URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=あなたのAnon Key
   SUPABASE_SERVICE_ROLE_KEY=sbp_eb79bdcfbaf912eaae855009eee9f1186de44b87

注意事項:
- Service Role Keyは秘密情報なので、公開リポジトリにコミットしないでください
- .env.localは.gitignoreに含まれているので安全です
- 本番環境ではVercelの環境変数に設定してください
`)