-- ランキングデータ用テーブル
CREATE TABLE IF NOT EXISTS rankings (
  key VARCHAR(255) PRIMARY KEY,
  data JSONB NOT NULL,
  popular_tags TEXT[] DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 更新時のタイムスタンプ自動更新
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rankings_updated_at BEFORE UPDATE ON rankings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- インデックス作成（検索高速化）
CREATE INDEX idx_rankings_updated_at ON rankings(updated_at DESC);

-- NGリスト用テーブル
CREATE TABLE IF NOT EXISTS ng_lists (
  type VARCHAR(50) PRIMARY KEY, -- 'manual' or 'derived'
  items JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NGリストの更新トリガー
CREATE TRIGGER update_ng_lists_updated_at BEFORE UPDATE ON ng_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)を有効化
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ng_lists ENABLE ROW LEVEL SECURITY;

-- 読み取り専用ポリシー（anonユーザー用）
CREATE POLICY "Enable read access for all users" ON rankings
    FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON ng_lists
    FOR SELECT USING (true);

-- 書き込みポリシー（service roleのみ）
CREATE POLICY "Enable insert for service role" ON rankings
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Enable update for service role" ON rankings
    FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Enable insert for service role" ON ng_lists
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Enable update for service role" ON ng_lists
    FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role');