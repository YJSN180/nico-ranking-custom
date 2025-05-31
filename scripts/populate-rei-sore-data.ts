// 例のソレランキングデータ投入スクリプト
import { updateReiSoreRanking, getReiSoreRanking } from '../lib/rei-sore-ranking'

async function populateData() {
  console.log('=== 例のソレランキングデータ投入 ===\n')
  
  console.log('注意: このスクリプトを実行する前に、Supabaseでテーブルを作成してください。')
  console.log('テーブルが未作成の場合は、以下を実行:')
  console.log('npx tsx scripts/init-supabase-tables.ts\n')
  
  console.log('データ投入を開始します...\n')
  
  try {
    // ランキングデータを更新
    await updateReiSoreRanking()
    
    console.log('\nランキングデータの確認...')
    
    // 24時間ランキングを取得
    const dailyRanking = await getReiSoreRanking('daily', 10)
    console.log('\n24時間ランキング TOP10:')
    dailyRanking.forEach(item => {
      console.log(`${item.rank}位. ${item.title}`)
      console.log(`    再生: ${item.views.toLocaleString()}, いいね: ${item.likes.toLocaleString()}`)
    })
    
    // 毎時ランキングを取得
    const hourlyRanking = await getReiSoreRanking('hourly', 10)
    console.log('\n\n毎時ランキング TOP10:')
    hourlyRanking.forEach(item => {
      console.log(`${item.rank}位. ${item.title}`)
      console.log(`    再生: ${item.views.toLocaleString()}, いいね: ${item.likes.toLocaleString()}`)
    })
    
    console.log('\n✅ データ投入が完了しました！')
    
  } catch (error: any) {
    console.error('\n❌ エラーが発生しました:', error.message)
    
    if (error.message?.includes('relation "rei_sore_videos" does not exist')) {
      console.log('\nテーブルが存在しません。以下の手順でテーブルを作成してください:')
      console.log('1. Supabaseダッシュボード (https://app.supabase.com) にアクセス')
      console.log('2. SQL Editorを開く')
      console.log('3. 以下のコマンドで表示されるSQLを実行:')
      console.log('   npx tsx scripts/init-supabase-tables.ts')
    }
  }
}

populateData().catch(console.error)