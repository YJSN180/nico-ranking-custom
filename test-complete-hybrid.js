// 完全ハイブリッドスクレイピングのリアルタイムテスト
const { scrapeRankingPage } = require('./lib/scraper.ts');

async function testCompleteHybrid() {
  console.log('=== Complete Hybrid Scraping Test ===');
  console.log('Testing with real Niconico API...\n');
  
  try {
    // Test 1: その他ジャンル（センシティブ動画が含まれやすい）
    console.log('1. Testing "other" genre (may contain sensitive videos)...');
    const startTime = Date.now();
    const result = await scrapeRankingPage('other', '24h');
    const elapsedTime = Date.now() - startTime;
    
    console.log(`   Total videos: ${result.items.length}`);
    console.log(`   Processing time: ${elapsedTime}ms`);
    console.log(`   Popular tags: ${result.popularTags?.slice(0, 5).join(', ')}`);
    
    // データ完全性チェック
    const withComments = result.items.filter(item => item.comments !== undefined).length;
    const withLikes = result.items.filter(item => item.likes !== undefined).length;
    const withAuthorName = result.items.filter(item => item.authorName).length;
    const withAuthorIcon = result.items.filter(item => item.authorIcon).length;
    
    console.log(`   With comments: ${withComments}/${result.items.length}`);
    console.log(`   With likes: ${withLikes}/${result.items.length}`);
    console.log(`   With author name: ${withAuthorName}/${result.items.length}`);
    console.log(`   With author icon: ${withAuthorIcon}/${result.items.length}`);
    
    // Top 5 videos
    console.log('\n   Top 5 videos:');
    result.items.slice(0, 5).forEach(item => {
      console.log(`   ${item.rank}. ${item.title} (${item.id})`);
      console.log(`      Views: ${item.views}, Comments: ${item.comments || 'N/A'}, Author: ${item.authorName || 'N/A'}`);
    });
    
    // センシティブ動画の確認
    console.log('\n   Checking for potentially sensitive videos...');
    const keywords = ['Gundam', 'ガンダム', '静電気', 'ドッキリ', 'R-18', 'センシティブ'];
    const sensitiveVideos = result.items.filter(item => 
      keywords.some(keyword => item.title?.includes(keyword))
    );
    
    if (sensitiveVideos.length > 0) {
      console.log(`   Found ${sensitiveVideos.length} potentially sensitive videos:`);
      sensitiveVideos.forEach(video => {
        console.log(`   - Rank ${video.rank}: ${video.title} (${video.id})`);
      });
    } else {
      console.log('   No obviously sensitive videos found in titles');
    }
    
    // Test 2: タグフィルタリング
    console.log('\n2. Testing tag filtering (should use nvAPI only)...');
    const tagStartTime = Date.now();
    const tagResult = await scrapeRankingPage('vocaloid', '24h', 'VOCALOID伝説入り');
    const tagElapsedTime = Date.now() - tagStartTime;
    
    console.log(`   Total videos: ${tagResult.items.length}`);
    console.log(`   Processing time: ${tagElapsedTime}ms (should be faster than hybrid)`);
    console.log(`   First video: ${tagResult.items[0]?.title}`);
    
    // パフォーマンス分析
    console.log('\n=== Performance Analysis ===');
    console.log(`Hybrid scraping time: ${elapsedTime}ms`);
    console.log(`Tag-filtered time: ${tagElapsedTime}ms`);
    console.log(`Difference: ${elapsedTime - tagElapsedTime}ms`);
    
    if (elapsedTime > 3000) {
      console.log('⚠️  Hybrid scraping is taking longer than expected (>3s)');
      console.log('   This might be due to fetching author info for sensitive videos');
    } else {
      console.log('✅ Performance is within acceptable range');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// 実行
console.log('Note: This test requires proper module imports.');
console.log('Please run via: node -r esbuild-register test-complete-hybrid.js');
console.log('Or use the API endpoint: /api/test-scraping/complete-hybrid');