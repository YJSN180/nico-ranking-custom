// Supabaseテーブル初期化スクリプト
import { createClient } from '@supabase/supabase-js'

console.log(`
=== Supabaseテーブル初期化 ===

このスクリプトを実行する前に、以下の手順でテーブルを作成してください：

1. Supabaseダッシュボードにアクセス
   https://app.supabase.com

2. プロジェクトを選択

3. 左メニューから「SQL Editor」を選択

4. 「New query」をクリック

5. 以下のSQLを貼り付けて実行:

========== ここから ==========
`)

// SQLマイグレーションファイルの内容を表示
const migrationSQL = `-- 例のソレジャンル動画テーブル
CREATE TABLE IF NOT EXISTS rei_sore_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id VARCHAR(20) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  view_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  mylist_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  upload_time TIMESTAMP WITH TIME ZONE,
  thumbnail_url TEXT,
  owner_name TEXT,
  owner_id TEXT,
  genre TEXT DEFAULT '例のソレ',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ランキングスコアテーブル
CREATE TABLE IF NOT EXISTS rei_sore_ranking_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id VARCHAR(20) NOT NULL REFERENCES rei_sore_videos(content_id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  rank_type VARCHAR(10) NOT NULL CHECK (rank_type IN ('hourly', 'daily')),
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_id, rank_type)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_rei_sore_videos_content_id ON rei_sore_videos(content_id);
CREATE INDEX IF NOT EXISTS idx_rei_sore_videos_upload_time ON rei_sore_videos(upload_time);
CREATE INDEX IF NOT EXISTS idx_rei_sore_ranking_scores_rank_type ON rei_sore_ranking_scores(rank_type);
CREATE INDEX IF NOT EXISTS idx_rei_sore_ranking_scores_score ON rei_sore_ranking_scores(score DESC);

-- 更新時刻自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rei_sore_videos_updated_at 
  BEFORE UPDATE ON rei_sore_videos 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- RLS（Row Level Security）の設定
ALTER TABLE rei_sore_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_sore_ranking_scores ENABLE ROW LEVEL SECURITY;

-- 読み取り専用ポリシー（匿名ユーザーも読める）
CREATE POLICY "Allow public read access" ON rei_sore_videos
  FOR SELECT USING (true);

CREATE POLICY "Allow public read access" ON rei_sore_ranking_scores
  FOR SELECT USING (true);

-- 書き込みはサービスロールのみ
CREATE POLICY "Service role can insert" ON rei_sore_videos
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update" ON rei_sore_videos
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert" ON rei_sore_ranking_scores
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update" ON rei_sore_ranking_scores
  FOR UPDATE USING (auth.role() = 'service_role');`

console.log(migrationSQL)

console.log(`
========== ここまで ==========

6. 「Run」ボタンをクリックして実行

7. 実行が成功したら、以下のコマンドで接続を確認:
   npx tsx scripts/test-supabase-connection.ts

8. Service Role Keyが必要な場合:
   - Settings → API → Service role keyをコピー
   - .env.localのSUPABASE_SERVICE_ROLE_KEYを更新

注意: Service Role Keyは管理者権限を持つため、絶対に公開しないでください。
`)