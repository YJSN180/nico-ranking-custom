import { getNGList } from '../lib/ng-filter'

async function checkNGList() {
  console.log('=== 現在のNGリストを確認 ===\n')
  
  try {
    const ngList = await getNGList()
    
    console.log('手動NGリスト:')
    console.log(`  動画ID: ${ngList.videoIds.length}件`)
    if (ngList.videoIds.length > 0) {
      console.log(`    例: ${ngList.videoIds.slice(0, 3).join(', ')}${ngList.videoIds.length > 3 ? '...' : ''}`)
    }
    
    console.log(`  動画タイトル: ${ngList.videoTitles.length}件`)
    if (ngList.videoTitles.length > 0) {
      console.log(`    例: ${ngList.videoTitles.slice(0, 3).join(', ')}${ngList.videoTitles.length > 3 ? '...' : ''}`)
    }
    
    console.log(`  投稿者ID: ${ngList.authorIds.length}件`)
    if (ngList.authorIds.length > 0) {
      console.log(`    例: ${ngList.authorIds.slice(0, 3).join(', ')}${ngList.authorIds.length > 3 ? '...' : ''}`)
    }
    
    console.log(`  投稿者名: ${ngList.authorNames.length}件`)
    if (ngList.authorNames.length > 0) {
      console.log(`    例: ${ngList.authorNames.slice(0, 3).join(', ')}${ngList.authorNames.length > 3 ? '...' : ''}`)
    }
    
    console.log(`\n派生動画ID: ${ngList.derivedVideoIds.length}件`)
    if (ngList.derivedVideoIds.length > 0) {
      console.log(`  例: ${ngList.derivedVideoIds.slice(0, 5).join(', ')}${ngList.derivedVideoIds.length > 5 ? '...' : ''}`)
    }
    
    console.log('\n合計NG対象:')
    const totalNGVideos = ngList.videoIds.length + ngList.derivedVideoIds.length
    console.log(`  動画: ${totalNGVideos}件`)
    console.log(`  投稿者: ${ngList.authorIds.length + ngList.authorNames.length}件`)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkNGList().catch(console.error)