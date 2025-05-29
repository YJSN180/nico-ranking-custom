// テスト: ハイブリッドスクレイピングの動作確認
const { scrapeRankingPage } = require('./lib/scraper.ts');

async function testHybridScraping() {
  console.log('=== Testing Hybrid Scraping ===');
  
  try {
    // その他ジャンルでテスト（センシティブ動画が含まれやすい）
    console.log('\nFetching "other" genre ranking...');
    const result = await scrapeRankingPage('other', '24h');
    
    console.log(`Total items: ${result.items.length}`);
    console.log(`Popular tags: ${result.popularTags?.slice(0, 5).join(', ')}...`);
    
    // 最初の10件を表示
    console.log('\nTop 10 videos:');
    result.items.slice(0, 10).forEach((item, index) => {
      console.log(`${index + 1}. ${item.title} (${item.id})`);
      console.log(`   Views: ${item.views}, Comments: ${item.comments || 'N/A'}, Likes: ${item.likes || 'N/A'}`);
    });
    
    // センシティブ動画を探す
    console.log('\n=== Checking for specific videos ===');
    const gundam = result.items.find(item => 
      item.title?.includes('Gundam') || item.title?.includes('ジークソクス')
    );
    const staticElec = result.items.find(item => 
      item.title?.includes('静電気') || item.title?.includes('ドッキリ')
    );
    
    if (gundam) {
      console.log('\n✅ Found Gundam video:');
      console.log(`   Rank: ${gundam.rank}, ID: ${gundam.id}`);
      console.log(`   Title: ${gundam.title}`);
    } else {
      console.log('\n❌ Gundam video not found');
    }
    
    if (staticElec) {
      console.log('\n✅ Found static electricity video:');
      console.log(`   Rank: ${staticElec.rank}, ID: ${staticElec.id}`);
      console.log(`   Title: ${staticElec.title}`);
    } else {
      console.log('\n❌ Static electricity video not found');
    }
    
    // メタデータの充実度をチェック
    console.log('\n=== Metadata completeness ===');
    const withComments = result.items.filter(item => item.comments !== undefined).length;
    const withLikes = result.items.filter(item => item.likes !== undefined).length;
    const withMylists = result.items.filter(item => item.mylists !== undefined).length;
    
    console.log(`Videos with comment count: ${withComments}/${result.items.length}`);
    console.log(`Videos with like count: ${withLikes}/${result.items.length}`);
    console.log(`Videos with mylist count: ${withMylists}/${result.items.length}`);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// TypeScriptモジュールを直接実行できない場合の代替
console.log('Note: This test requires TypeScript runtime or transpilation.');
console.log('Please run via Next.js API route instead: /api/test-scraping/test-hybrid');