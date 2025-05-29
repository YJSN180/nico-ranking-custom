// 実際のAPIを使用して投稿者アイコンの取得をテスト
const { scrapeRankingPage } = require('./lib/scraper.ts');

async function testRealAuthorIcons() {
  console.log('=== Real Author Icon Fetching Test ===');
  console.log('Testing with actual Niconico API...\n');
  
  try {
    // 実際のランキングデータを取得
    console.log('Fetching "other" genre ranking...');
    const startTime = Date.now();
    const result = await scrapeRankingPage('other', '24h');
    const elapsedTime = Date.now() - startTime;
    
    console.log(`\nFetch completed in ${elapsedTime}ms`);
    console.log(`Total videos: ${result.items.length}`);
    
    // 投稿者情報の統計
    const stats = {
      total: result.items.length,
      withAuthorId: result.items.filter(item => item.authorId).length,
      withAuthorName: result.items.filter(item => item.authorName).length,
      withAuthorIcon: result.items.filter(item => item.authorIcon).length,
    };
    
    console.log('\n=== Author Info Statistics ===');
    console.log(`Total videos: ${stats.total}`);
    console.log(`With author ID: ${stats.withAuthorId} (${Math.round(stats.withAuthorId/stats.total*100)}%)`);
    console.log(`With author name: ${stats.withAuthorName} (${Math.round(stats.withAuthorName/stats.total*100)}%)`);
    console.log(`With author icon: ${stats.withAuthorIcon} (${Math.round(stats.withAuthorIcon/stats.total*100)}%)`);
    
    // 投稿者アイコンがある動画の例
    console.log('\n=== Videos WITH Author Icons (Top 5) ===');
    result.items
      .filter(item => item.authorIcon)
      .slice(0, 5)
      .forEach((item, index) => {
        console.log(`\n${index + 1}. [Rank ${item.rank}] ${item.title}`);
        console.log(`   Video ID: ${item.id}`);
        console.log(`   Author: ${item.authorName} (${item.authorId})`);
        console.log(`   Icon URL: ${item.authorIcon}`);
        console.log(`   Icon valid: ${item.authorIcon?.startsWith('https://')}`);
      });
    
    // 投稿者アイコンがない動画の例
    console.log('\n=== Videos WITHOUT Author Icons (Top 5) ===');
    const videosWithoutIcons = result.items.filter(item => !item.authorIcon);
    
    if (videosWithoutIcons.length > 0) {
      videosWithoutIcons.slice(0, 5).forEach((item, index) => {
        console.log(`\n${index + 1}. [Rank ${item.rank}] ${item.title}`);
        console.log(`   Video ID: ${item.id}`);
        console.log(`   Has author ID: ${!!item.authorId}`);
        console.log(`   Has author name: ${!!item.authorName}`);
        console.log(`   Author: ${item.authorName || 'N/A'} (${item.authorId || 'N/A'})`);
      });
    } else {
      console.log('All videos have author icons!');
    }
    
    // センシティブ動画の投稿者情報確認
    console.log('\n=== Checking Sensitive Videos ===');
    const sensitiveKeywords = ['Gundam', 'ガンダム', '静電気', 'ドッキリ', 'R-18', 'センシティブ'];
    const sensitiveVideos = result.items.filter(item => 
      sensitiveKeywords.some(keyword => item.title?.includes(keyword))
    );
    
    if (sensitiveVideos.length > 0) {
      console.log(`Found ${sensitiveVideos.length} potentially sensitive videos`);
      sensitiveVideos.slice(0, 3).forEach((item, index) => {
        console.log(`\n${index + 1}. [Rank ${item.rank}] ${item.title}`);
        console.log(`   Has author icon: ${!!item.authorIcon}`);
        console.log(`   Author: ${item.authorName || 'N/A'}`);
      });
    } else {
      console.log('No obviously sensitive videos found');
    }
    
    // 成功判定
    console.log('\n=== Test Result ===');
    if (stats.withAuthorIcon >= stats.total * 0.8) {
      console.log('✅ SUCCESS: Author icon fetching is working well (>80% success rate)');
    } else if (stats.withAuthorIcon >= stats.total * 0.5) {
      console.log('⚠️  WARNING: Author icon fetching is partially working (50-80% success rate)');
    } else {
      console.log('❌ FAILURE: Author icon fetching has low success rate (<50%)');
    }
    
    // パフォーマンス評価
    if (elapsedTime > 5000) {
      console.log(`\n⚠️  Performance warning: Fetching took ${elapsedTime}ms (>5s)`);
      console.log('This might be due to fetching author info for many videos');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Note about running
console.log('This test requires proper imports.');
console.log('Run via Next.js API endpoint or use appropriate module loader.\n');

// Export for use in API endpoint
module.exports = { testRealAuthorIcons };