// タグ別ランキングのNGフィルタリング状態を確認

async function checkTagRankingNG() {
  console.log('=== タグ別ランキングのNGフィルタリング確認 ===\n')
  
  try {
    // インタビューシリーズのランキングを確認
    const url = 'https://nico-ranking-custom.vercel.app/api/ranking?genre=other&period=24h&tag=' + encodeURIComponent('インタビューシリーズ')
    console.log('URL:', url)
    
    const res = await fetch(url)
    const data = await res.json()
    
    console.log(`\n総アイテム数: ${data.items?.length || 0}件`)
    
    // NGリストの投稿者
    const ngAuthors = ['蠍媛', 'ゴMNT', '地雷姫', 'ほまリニスト', 'ぱぱら快刀', 'くりうくろう']
    
    // NGリストの投稿者を探す
    const foundNG = data.items?.filter((item: any) => 
      ngAuthors.includes(item.authorName)
    ) || []
    
    if (foundNG.length > 0) {
      console.log(`\n⚠️  NGリストの投稿者が見つかりました: ${foundNG.length}件\n`)
      foundNG.forEach((item: any, index: number) => {
        console.log(`${index + 1}. 「${item.title}」`)
        console.log(`   ID: ${item.id}`)
        console.log(`   投稿者: ${item.authorName}`)
        console.log(`   ランク: ${item.rank}位`)
        console.log('')
      })
    } else {
      console.log('\n✅ NGリストの投稿者は含まれていません')
    }
    
    // 上位10件の投稿者を表示
    console.log('\n上位10件の投稿者:')
    data.items?.slice(0, 10).forEach((item: any) => {
      console.log(`${item.rank}位: ${item.authorName} - 「${item.title}」`)
    })
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkTagRankingNG().catch(console.error)