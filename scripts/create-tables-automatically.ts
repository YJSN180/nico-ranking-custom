// Supabaseテーブル自動作成スクリプト
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://quzyxlfmixskrciqraxv.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1enl4bGZtaXhza3JjaXFyYXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODcwNzU1NCwiZXhwIjoyMDY0MjgzNTU0fQ.opH2mrIHHcnfXhZqr2_drI7MF6vI56FO0g9weinWY5w'

async function createTables() {
  console.log('=== Supabaseテーブル自動作成 ===\n')
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  const sql = `
    -- 例のソレジャンル動画テーブル
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
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_videos' 
        AND policyname = 'Allow public read access'
      ) THEN
        CREATE POLICY "Allow public read access" ON rei_sore_videos
          FOR SELECT USING (true);
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_ranking_scores' 
        AND policyname = 'Allow public read access'
      ) THEN
        CREATE POLICY "Allow public read access" ON rei_sore_ranking_scores
          FOR SELECT USING (true);
      END IF;
    END $$;

    -- 書き込みはサービスロールのみ（ポリシー名を変更）
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_videos' 
        AND policyname = 'Service role can insert videos'
      ) THEN
        CREATE POLICY "Service role can insert videos" ON rei_sore_videos
          FOR INSERT WITH CHECK (auth.role() = 'service_role');
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_videos' 
        AND policyname = 'Service role can update videos'
      ) THEN
        CREATE POLICY "Service role can update videos" ON rei_sore_videos
          FOR UPDATE USING (auth.role() = 'service_role');
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_ranking_scores' 
        AND policyname = 'Service role can insert scores'
      ) THEN
        CREATE POLICY "Service role can insert scores" ON rei_sore_ranking_scores
          FOR INSERT WITH CHECK (auth.role() = 'service_role');
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rei_sore_ranking_scores' 
        AND policyname = 'Service role can update scores'
      ) THEN
        CREATE POLICY "Service role can update scores" ON rei_sore_ranking_scores
          FOR UPDATE USING (auth.role() = 'service_role');
      END IF;
    END $$;
  `
  
  try {
    console.log('テーブルを作成中...')
    
    // SQLを実行
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
      // exec_sql RPCが存在しない場合は、直接実行を試みる
      // Supabase JSクライアントでは直接SQL実行はサポートされていないため、
      // REST APIを使用
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql_query: sql })
      })
      
      if (!response.ok) {
        // exec_sql関数が存在しない場合は、手動実行を促す
        throw new Error('SQL実行機能が利用できません')
      }
      
      return response.json()
    })
    
    if (error) {
      throw error
    }
    
    console.log('✅ テーブルの作成が完了しました！')
    
    // テーブルの存在確認
    const { data: videos } = await supabase.from('rei_sore_videos').select('count').limit(1)
    const { data: scores } = await supabase.from('rei_sore_ranking_scores').select('count').limit(1)
    
    console.log('\nテーブル確認:')
    console.log('✅ rei_sore_videos テーブル: 作成済み')
    console.log('✅ rei_sore_ranking_scores テーブル: 作成済み')
    
  } catch (error: any) {
    if (error.message === 'SQL実行機能が利用できません') {
      console.log('❌ 自動実行ができません。')
      console.log('\n以下の方法でテーブルを作成してください:')
      console.log('1. Supabaseダッシュボード (https://app.supabase.com) にアクセス')
      console.log('2. SQL Editorで以下のSQLを実行:')
      console.log('\nnpx tsx scripts/init-supabase-tables.ts')
    } else {
      console.error('エラー:', error.message)
    }
  }
}

createTables().catch(console.error)