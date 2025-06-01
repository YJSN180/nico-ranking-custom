// Supabase接続テスト
import { createClient } from '@supabase/supabase-js'

// 環境変数から設定を読み込む
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://quzyxlfmixskrciqraxv.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1enl4bGZtaXhza3JjaXFyYXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MDc1NTQsImV4cCI6MjA2NDI4MzU1NH0.EFElNAQXl4NXWfnbsWUMfLg7Pn3hSjq2Wb0q9PkrGkM'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1enl4bGZtaXhza3JjaXFyYXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODcwNzU1NCwiZXhwIjoyMDY0MjgzNTU0fQ.opH2mrIHHcnfXhZqr2_drI7MF6vI56FO0g9weinWY5w'

async function testConnection() {
  console.log('=== Supabase接続テスト ===\n')
  
  console.log('1. 環境設定:')
  console.log(`   URL: ${supabaseUrl}`)
  console.log(`   Anon Key: ${supabaseAnonKey.substring(0, 20)}...`)
  console.log(`   Service Key: ${supabaseServiceKey.substring(0, 20)}...`)
  
  // Anonキーでクライアント作成（読み取り専用）
  console.log('\n2. Anonキーで接続テスト...')
  const anonClient = createClient(supabaseUrl, supabaseAnonKey)
  
  try {
    // テーブルが存在するか確認
    const { data, error } = await anonClient
      .from('rei_sore_videos')
      .select('count')
      .limit(1)
    
    if (error) {
      if (error.code === '42P01') {
        console.log('   ❌ テーブルが存在しません。初期化が必要です。')
      } else {
        console.log(`   ❌ エラー: ${error.message}`)
      }
    } else {
      console.log('   ✅ 接続成功！')
    }
  } catch (err) {
    console.log(`   ❌ 接続エラー: ${err}`)
  }
  
  // Service Roleキーでクライアント作成（管理者権限）
  console.log('\n3. Service Roleキーで接続テスト...')
  const adminClient = createClient(supabaseUrl, supabaseServiceKey)
  
  try {
    // スキーマ情報を取得
    const { data, error } = await adminClient
      .from('rei_sore_videos')
      .select('*')
      .limit(0)
    
    if (error) {
      if (error.code === '42P01') {
        console.log('   ❌ テーブルが存在しません。')
        console.log('\n4. テーブルを作成しますか？')
        console.log('   以下のコマンドを実行してください:')
        console.log('   npx tsx scripts/init-supabase-tables.ts')
      } else {
        console.log(`   ❌ エラー: ${error.message}`)
      }
    } else {
      console.log('   ✅ 管理者接続成功！')
      
      // テーブルの行数を確認
      const { count } = await adminClient
        .from('rei_sore_videos')
        .select('*', { count: 'exact', head: true })
      
      console.log(`   現在の動画数: ${count || 0}件`)
    }
  } catch (err) {
    console.log(`   ❌ 接続エラー: ${err}`)
  }
}

testConnection().catch(console.error)