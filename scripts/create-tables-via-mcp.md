# MCP経由でのテーブル作成手順

## 1. MCPが有効か確認
```
mcp
```

"supabase"サーバーが表示されることを確認

## 2. テーブル作成（MCPコマンド使用）

### rei_sore_videosテーブル作成
```
supabase_query "CREATE TABLE IF NOT EXISTS rei_sore_videos (
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
)"
```

### rei_sore_ranking_scoresテーブル作成
```
supabase_query "CREATE TABLE IF NOT EXISTS rei_sore_ranking_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id VARCHAR(20) NOT NULL REFERENCES rei_sore_videos(content_id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  rank_type VARCHAR(10) NOT NULL CHECK (rank_type IN ('hourly', 'daily')),
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(video_id, rank_type)
)"
```

### インデックス作成
```
supabase_query "CREATE INDEX IF NOT EXISTS idx_rei_sore_videos_content_id ON rei_sore_videos(content_id)"
supabase_query "CREATE INDEX IF NOT EXISTS idx_rei_sore_videos_upload_time ON rei_sore_videos(upload_time)"
supabase_query "CREATE INDEX IF NOT EXISTS idx_rei_sore_ranking_scores_rank_type ON rei_sore_ranking_scores(rank_type)"
supabase_query "CREATE INDEX IF NOT EXISTS idx_rei_sore_ranking_scores_score ON rei_sore_ranking_scores(score DESC)"
```

### トリガー関数作成
```
supabase_query "CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql'"
```

### トリガー作成
```
supabase_query "CREATE TRIGGER update_rei_sore_videos_updated_at BEFORE UPDATE ON rei_sore_videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
```

### RLS有効化
```
supabase_query "ALTER TABLE rei_sore_videos ENABLE ROW LEVEL SECURITY"
supabase_query "ALTER TABLE rei_sore_ranking_scores ENABLE ROW LEVEL SECURITY"
```

### RLSポリシー作成
```
supabase_query "CREATE POLICY \"Allow public read access\" ON rei_sore_videos FOR SELECT USING (true)"
supabase_query "CREATE POLICY \"Allow public read access scores\" ON rei_sore_ranking_scores FOR SELECT USING (true)"
```

## 3. テーブル確認
```
supabase_list_tables
```

## 4. データ投入
```bash
npx tsx scripts/populate-rei-sore-data.ts
```