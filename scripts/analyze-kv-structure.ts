#!/usr/bin/env npx tsx

// Analyze KV structure and data sizes

interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments?: number
  mylists?: number
  likes?: number
  tags?: string[]
  authorId?: string
  authorName?: string
  authorIcon?: string
  registeredAt?: string
}

// Calculate approximate JSON size for a single ranking item
function calculateItemSize(item: RankingItem): number {
  const sampleItem = {
    rank: item.rank,
    id: 'sm12345678', // ~10 chars
    title: 'x'.repeat(100), // ~100 chars average
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.L', // ~60 chars
    views: 1234567,
    comments: 12345,
    mylists: 1234,
    likes: 12345,
    tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'], // ~50 chars total
    authorId: '12345678', // ~8 chars
    authorName: 'Author Name Here', // ~15 chars
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg', // ~75 chars
    registeredAt: '2024-01-01T00:00:00+09:00' // ~25 chars
  }
  
  return JSON.stringify(sampleItem).length
}

// Calculate data structure sizes
function analyzeDataStructure() {
  console.log('=== KV Data Structure Analysis ===\n')
  
  // Sample item size
  const sampleItem: RankingItem = {
    rank: 1,
    id: 'sm12345678',
    title: 'Sample Video Title That Is Quite Long',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.L',
    views: 1234567,
    comments: 12345,
    mylists: 1234,
    likes: 12345,
    tags: ['tag1', 'tag2', 'tag3'],
    authorId: '12345678',
    authorName: 'Author Name',
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg',
    registeredAt: '2024-01-01T00:00:00+09:00'
  }
  
  const itemSize = calculateItemSize(sampleItem)
  console.log(`Average item size: ~${itemSize} bytes`)
  
  // Current structure
  const genres = 23
  const periods = 2 // 24h, hour
  const itemsPerGenre = 500
  const popularTagsPerGenre = 10
  const tagRankingsPerGenre = 10 // "その他" genre only
  const itemsPerTagRanking = 300
  
  // Main ranking data
  const mainRankingSize = genres * periods * itemsPerGenre * itemSize
  console.log(`\nMain rankings (${genres} genres × ${periods} periods × ${itemsPerGenre} items):`)
  console.log(`  ${(mainRankingSize / 1024 / 1024).toFixed(2)} MB`)
  
  // Tag rankings (only for "other" genre)
  const tagRankingSize = 1 * periods * tagRankingsPerGenre * itemsPerTagRanking * itemSize
  console.log(`\nTag rankings (1 genre × ${periods} periods × ${tagRankingsPerGenre} tags × ${itemsPerTagRanking} items):`)
  console.log(`  ${(tagRankingSize / 1024 / 1024).toFixed(2)} MB`)
  
  // Total uncompressed
  const totalUncompressed = mainRankingSize + tagRankingSize
  console.log(`\nTotal uncompressed: ${(totalUncompressed / 1024 / 1024).toFixed(2)} MB`)
  
  // Compression ratio (typically 85-90% for JSON)
  const compressionRatio = 0.88
  const totalCompressed = totalUncompressed * (1 - compressionRatio)
  console.log(`Total compressed (~${compressionRatio * 100}% reduction): ${(totalCompressed / 1024 / 1024).toFixed(2)} MB`)
  
  // Problem analysis
  console.log('\n=== Current Problems ===')
  console.log('1. Single KV key contains ALL data (8.4MB compressed)')
  console.log('2. Tag ranking query must:')
  console.log('   - Fetch entire 8.4MB blob from KV')
  console.log('   - Decompress in memory (Node.js runtime)')
  console.log('   - Parse massive JSON object')
  console.log('   - Extract specific tag data')
  console.log('3. Vercel response size limit: 4.5MB (compressed data exceeds this)')
  console.log('4. Memory pressure during decompression')
  console.log('5. Network transfer time for large blob')
  
  // Proposed improvements
  console.log('\n=== Proposed Solution ===')
  console.log('Split data into multiple KV keys:')
  console.log('1. Main rankings: ranking:{genre}:{period} (23 × 2 = 46 keys)')
  console.log('   - Each ~180KB compressed')
  console.log('2. Tag rankings: ranking:tag:{genre}:{period}:{tag}')
  console.log('   - Each ~50KB compressed')
  console.log('3. Popular tags: popular-tags:{genre}:{period}')
  console.log('   - Each ~1KB')
  console.log('4. Metadata: ranking:metadata')
  console.log('   - Single key with update info')
  
  // Benefits
  console.log('\n=== Benefits ===')
  console.log('1. Fetch only needed data (180KB vs 8.4MB)')
  console.log('2. No decompression needed (under 1MB threshold)')
  console.log('3. Parallel fetching possible')
  console.log('4. Better cache efficiency')
  console.log('5. Reduced memory usage')
  console.log('6. Faster response times')
  console.log('7. Within Vercel limits')
  
  // Implementation
  console.log('\n=== Implementation Steps ===')
  console.log('1. Update aggregation script to write multiple keys')
  console.log('2. Update KV read functions to use new key structure')
  console.log('3. Add migration logic for backward compatibility')
  console.log('4. Test with gradual rollout')
}

// Run analysis
analyzeDataStructure()