import { kv } from '@vercel/kv'
import dotenv from 'dotenv'
import path from 'path'

// .env.localを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function verifyUI300Items() {
  console.log('=== UIでの300件表示検証 ===\n')
  
  try {
    // KVから「その他」ジャンルのデータを取得
    const data = await kv.get('ranking-other-24h') as any
    
    if (!data || !data.items) {
      console.error('データが見つかりません')
      return
    }
    
    console.log(`KVに保存されているデータ:`)
    console.log(`  アイテム数: ${data.items.length}件`)
    console.log(`  人気タグ: ${data.popularTags?.slice(0, 5).join(', ') || 'なし'}`)
    console.log(`  更新日時: ${data.updatedAt}\n`)
    
    if (data.items.length > 100) {
      console.log('✅ 100件以上のデータが存在します！')
      console.log('\n「もっと見る」ボタンが表示されるはずの条件:')
      console.log(`  displayCount (100) < realtimeItems.length (${data.items.length})`);
      console.log('  → true なのでボタンが表示されるはず\n')
      
      // データのサンプルを表示
      console.log('データサンプル:')
      console.log(`  1位: ${data.items[0]?.title}`)
      console.log(`  100位: ${data.items[99]?.title}`)
      console.log(`  101位: ${data.items[100]?.title}`)
      console.log(`  200位: ${data.items[199]?.title}`)
      console.log(`  300位: ${data.items[299]?.title || '(データなし)'}`)
      
      // 本番サイトのURLを生成
      console.log('\n本番サイトで確認:')
      console.log('https://nico-ranking-custom.vercel.app/?genre=other&period=24h')
      console.log('\n確認ポイント:')
      console.log('1. 初期表示で100件表示される')
      console.log('2. 「もっと見る（100 / 300件）」ボタンが表示される')
      console.log('3. ボタンクリックで追加100件が表示される')
      console.log('4. 2回クリックで全300件が表示される')
      
    } else {
      console.log('❌ データが100件以下です。「もっと見る」ボタンは表示されません。')
    }
    
    // APIレスポンスも確認
    console.log('\n\nAPIエンドポイントのテスト:')
    console.log('curl -s https://nico-ranking-custom.vercel.app/api/ranking?genre=other&period=24h | grep -o \'"rank":\' | wc -l')
    console.log('↑ このコマンドで300が返ってくるはずです')
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

verifyUI300Items().catch(console.error)