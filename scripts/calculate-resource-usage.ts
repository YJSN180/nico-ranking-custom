#!/usr/bin/env tsx
// 現在の実装でのCloudflare KVとVercelの無料枠リソース使用量計算スクリプト

import type { RankingItem } from '@/types/ranking'
import { CACHED_GENRES } from '@/types/ranking-config'

// 典型的なランキングアイテムのサイズを計算
function calculateRankingItemSize(): number {
  const typicalItem: RankingItem = {
    rank: 1,
    id: 'sm12345678', // 通常10文字程度
    title: '【東方】カリスマブレイク × Bad Apple!! feat. 霊夢', // 日本語タイトル、平均40文字
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678.M', // 80文字程度
    views: 1234567,
    comments: 12345,
    mylists: 12345,
    likes: 12345,
    tags: ['東方', 'VOCALOID', '音楽', '作業用BGM', 'アレンジ'], // 平均5個のタグ
    authorId: '12345678',
    authorName: 'ユーザー名例', // 平均10文字
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/default/123456.jpg',
    registeredAt: '2024-01-01T12:00:00Z'
  }

  // JSONにシリアライズしてサイズを測定
  const jsonString = JSON.stringify(typicalItem)
  return Buffer.byteLength(jsonString, 'utf8')
}

// 人気タグの平均数を推定
function estimatePopularTagsCount(genre: string): number {
  // 観測に基づく推定値
  const tagCounts: Record<string, number> = {
    'all': 20,
    'game': 15,
    'entertainment': 12,
    'other': 25, // 最も多い
    'technology': 10,
    'anime': 18,
    'voicesynthesis': 12
  }
  
  return tagCounts[genre] || 15
}

// 圧縮率を推定（pakoのgzip圧縮）
function estimateCompressionRatio(): number {
  // JSONデータは通常70-80%の圧縮率
  return 0.25 // 25%のサイズに圧縮される
}

// Cloudflare KV使用量計算
function calculateKVUsage() {
  const itemSize = calculateRankingItemSize()
  const compressionRatio = estimateCompressionRatio()
  
  console.log('=== Cloudflare KV使用量計算 ===\n')
  console.log(`典型的なランキングアイテムサイズ: ${itemSize} bytes`)
  console.log(`圧縮率: ${(1 - compressionRatio) * 100}% (${compressionRatio * 100}%に圧縮)\n`)
  
  let totalUncompressedSize = 0
  let totalCompressedSize = 0
  let totalTagItems = 0
  
  // 各ジャンルの計算
  CACHED_GENRES.forEach(genre => {
    const periods = ['24h', 'hour'] as const
    const popularTagsCount = estimatePopularTagsCount(genre)
    
    periods.forEach(period => {
      // 基本ランキング: 300件
      const basicRankingSize = itemSize * 300
      totalUncompressedSize += basicRankingSize
      
      // タグ別ランキング
      const tagRankingSize = popularTagsCount * itemSize * 500
      totalUncompressedSize += tagRankingSize
      totalTagItems += popularTagsCount * 500
      
      console.log(`${genre}-${period}:`)
      console.log(`  基本ランキング: ${(basicRankingSize / 1024).toFixed(1)} KB (300件)`)
      console.log(`  人気タグ数: ${popularTagsCount}`)
      console.log(`  タグ別ランキング: ${(tagRankingSize / 1024).toFixed(1)} KB (${popularTagsCount} × 500件)`)
      console.log(`  小計: ${((basicRankingSize + tagRankingSize) / 1024).toFixed(1)} KB\n`)
    })
  })
  
  // メタデータとオーバーヘッド
  const metadataSize = 1024 // 1KB程度のメタデータ
  totalUncompressedSize += metadataSize
  
  // 圧縮後のサイズ
  totalCompressedSize = totalUncompressedSize * compressionRatio
  
  console.log('=== 合計 ===')
  console.log(`総アイテム数: ${(CACHED_GENRES.length * 2 * 300) + totalTagItems} 件`)
  console.log(`圧縮前サイズ: ${(totalUncompressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`圧縮後サイズ: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`\n=== Cloudflare KV無料枠比較 ===`)
  console.log(`ストレージ制限: 1,000 MB`)
  console.log(`使用量: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`使用率: ${((totalCompressedSize / 1024 / 1024) / 1000 * 100).toFixed(2)}%`)
  
  return {
    uncompressedSize: totalUncompressedSize,
    compressedSize: totalCompressedSize,
    totalItems: (CACHED_GENRES.length * 2 * 300) + totalTagItems
  }
}

// KV リクエスト数計算
function calculateKVRequests() {
  console.log('\n=== Cloudflare KV リクエスト数計算 ===\n')
  
  // 書き込み（クロンジョブ）
  const cronWrites = (24 * 60 / 10) * 1 // 10分ごとに1回の書き込み
  const dailyWrites = cronWrites
  const monthlyWrites = dailyWrites * 30
  
  console.log(`書き込み（クロンジョブ）:`)
  console.log(`  頻度: 10分ごと`)
  console.log(`  1日あたり: ${dailyWrites} 回`)
  console.log(`  1ヶ月あたり: ${monthlyWrites} 回`)
  
  // 読み取り（ユーザーアクセス）
  // 推定: 1日1000PV、30%がServer Component、70%がキャッシュヒット
  const dailyPageViews = 1000
  const serverComponentRatio = 0.3
  const cacheHitRatio = 0.7
  const dailyReads = dailyPageViews * serverComponentRatio * (1 - cacheHitRatio)
  const monthlyReads = dailyReads * 30
  
  console.log(`\n読み取り（ユーザーアクセス）:`)
  console.log(`  推定日間PV: ${dailyPageViews}`)
  console.log(`  Server Component比率: ${serverComponentRatio * 100}%`)
  console.log(`  キャッシュヒット率: ${cacheHitRatio * 100}%`)
  console.log(`  1日あたり: ${dailyReads} 回`)
  console.log(`  1ヶ月あたり: ${monthlyReads} 回`)
  
  const totalMonthlyRequests = monthlyWrites + monthlyReads
  
  console.log(`\n=== 無料枠比較 ===`)
  console.log(`読み取り制限: 100,000/日 (3,000,000/月)`)
  console.log(`書き込み制限: 1,000/日 (30,000/月)`)
  console.log(`リスト制限: 1,000/日 (30,000/月)`)
  console.log(``)
  console.log(`月間読み取り: ${monthlyReads} 回 (${(monthlyReads / 3000000 * 100).toFixed(2)}%)`)
  console.log(`月間書き込み: ${monthlyWrites} 回 (${(monthlyWrites / 30000 * 100).toFixed(2)}%)`)
  console.log(`月間総リクエスト: ${totalMonthlyRequests} 回`)
  
  return {
    dailyWrites,
    monthlyWrites,
    dailyReads,
    monthlyReads,
    totalMonthlyRequests
  }
}

// Vercel使用量計算
function calculateVercelUsage() {
  console.log('\n=== Vercel使用量計算 ===\n')
  
  // ファンクション実行時間
  const cronExecutionTime = 30 // 30秒 (全ジャンル・全タグ処理)
  const apiExecutionTime = 0.5 // 0.5秒 (KVからの読み取り)
  
  const cronExecutionsPerMonth = 30 * 24 * 6 // 月間クロン実行回数
  const apiExecutionsPerMonth = 1000 * 30 * 0.3 // 月間API実行回数（30%がサーバーサイド処理）
  
  const totalCronTime = cronExecutionsPerMonth * cronExecutionTime
  const totalApiTime = apiExecutionsPerMonth * apiExecutionTime
  const totalExecutionTime = totalCronTime + totalApiTime
  
  console.log(`クロンジョブ:`)
  console.log(`  実行時間: ${cronExecutionTime}秒/回`)
  console.log(`  月間実行回数: ${cronExecutionsPerMonth}回`)
  console.log(`  月間実行時間: ${totalCronTime}秒 (${(totalCronTime / 60).toFixed(1)}分)`)
  
  console.log(`\nAPI エンドポイント:`)
  console.log(`  実行時間: ${apiExecutionTime}秒/回`)
  console.log(`  月間実行回数: ${apiExecutionsPerMonth}回`)
  console.log(`  月間実行時間: ${totalApiTime}秒 (${(totalApiTime / 60).toFixed(1)}分)`)
  
  // 帯域幅計算
  const averageResponseSize = 150 * 1024 // 150KB (圧縮後のランキングデータ)
  const monthlyBandwidth = apiExecutionsPerMonth * averageResponseSize
  
  console.log(`\n帯域幅:`)
  console.log(`  平均レスポンスサイズ: ${(averageResponseSize / 1024).toFixed(1)} KB`)
  console.log(`  月間転送量: ${(monthlyBandwidth / 1024 / 1024).toFixed(1)} MB`)
  
  console.log(`\n=== Vercel無料枠比較 ===`)
  console.log(`ファンクション実行時間制限: 100 GB-秒/月`)
  console.log(`帯域幅制限: 100 GB/月`)
  console.log(``)
  console.log(`月間実行時間: ${totalExecutionTime}秒 (${(totalExecutionTime / 100 / 1024 / 1024 * 100).toFixed(6)}%)`)
  console.log(`月間帯域幅: ${(monthlyBandwidth / 1024 / 1024).toFixed(1)} MB (${(monthlyBandwidth / 1024 / 1024 / 1024 / 100 * 100).toFixed(2)}%)`)
  
  return {
    totalExecutionTime,
    monthlyBandwidth,
    cronExecutionsPerMonth,
    apiExecutionsPerMonth
  }
}

// 最悪ケースのシナリオ
function calculateWorstCaseScenario() {
  console.log('\n=== 最悪ケースシナリオ ===\n')
  
  // より多くのタグと高いアクセス数を想定
  const worstCaseTagsPerGenre = 50 // 各ジャンル最大50個の人気タグ
  const worstCaseDailyPV = 10000 // 1日1万PV
  
  const itemSize = calculateRankingItemSize()
  const compressionRatio = estimateCompressionRatio()
  
  // KV使用量（最悪ケース）
  let worstCaseKVSize = 0
  CACHED_GENRES.forEach(genre => {
    const periods = ['24h', 'hour'] as const
    periods.forEach(period => {
      const basicSize = itemSize * 300
      const tagSize = worstCaseTagsPerGenre * itemSize * 500
      worstCaseKVSize += basicSize + tagSize
    })
  })
  
  worstCaseKVSize *= compressionRatio
  
  // リクエスト数（最悪ケース）
  const worstCaseReads = worstCaseDailyPV * 0.3 * 0.3 * 30 // 月間
  
  console.log(`人気タグ数: ${worstCaseTagsPerGenre}/ジャンル`)
  console.log(`日間PV: ${worstCaseDailyPV}`)
  console.log(`KVストレージ使用量: ${(worstCaseKVSize / 1024 / 1024).toFixed(1)} MB`)
  console.log(`月間KV読み取り: ${worstCaseReads}回`)
  console.log(``)
  console.log(`制限に対する使用率:`)
  console.log(`  KVストレージ: ${(worstCaseKVSize / 1024 / 1024 / 1000 * 100).toFixed(1)}%`)
  console.log(`  KV読み取り: ${(worstCaseReads / 3000000 * 100).toFixed(2)}%`)
  
  // 制限超過の判定
  const kvStorageExceeded = worstCaseKVSize > 1000 * 1024 * 1024
  const kvReadsExceeded = worstCaseReads > 3000000
  
  if (kvStorageExceeded || kvReadsExceeded) {
    console.log('\n🚨 最悪ケースで制限超過の可能性があります:')
    if (kvStorageExceeded) console.log('  - KVストレージ制限超過')
    if (kvReadsExceeded) console.log('  - KV読み取り制限超過')
  } else {
    console.log('\n✅ 最悪ケースでも無料枠内に収まります')
  }
}

// 最適化提案
function suggestOptimizations() {
  console.log('\n=== 最適化提案 ===\n')
  
  console.log('1. **データサイズ削減**:')
  console.log('   - 不要なフィールドの削除（authorIcon等）')
  console.log('   - サムネイルURLの短縮化')
  console.log('   - タグ数の制限（最大5個まで）')
  console.log('')
  
  console.log('2. **キャッシュ戦略の改善**:')
  console.log('   - CDNレベルでのキャッシュ（Cloudflare）')
  console.log('   - ブラウザキャッシュの有効活用')
  console.log('   - ISRの適切な設定')
  console.log('')
  
  console.log('3. **タグ別ランキングの最適化**:')
  console.log('   - 人気タグのみを事前キャッシュ（上位10個）')
  console.log('   - 残りのタグはオンデマンド取得')
  console.log('   - タグ別データの件数を300件に削減')
  console.log('')
  
  console.log('4. **アクセスパターンの分析**:')
  console.log('   - 実際のアクセス状況をモニタリング')
  console.log('   - 人気の低いジャンル/タグの特定')
  console.log('   - 動的な優先度調整')
  console.log('')
  
  console.log('5. **フォールバック戦略**:')
  console.log('   - 制限に近づいた場合の自動縮退')
  console.log('   - アラート機能の実装')
  console.log('   - 有料プランへのアップグレード検討')
}

// メイン実行
async function main() {
  console.log('現在の実装におけるCloudflare KV・Vercel無料枠リソース使用量計算')
  console.log('=' * 80)
  
  const kvUsage = calculateKVUsage()
  const kvRequests = calculateKVRequests()
  const vercelUsage = calculateVercelUsage()
  
  calculateWorstCaseScenario()
  suggestOptimizations()
  
  console.log('\n=== 総合判定 ===')
  console.log('現在の実装は無料枠内に収まる可能性が高いですが、')
  console.log('アクセス数増加や人気タグ数の増加により制限に近づく可能性があります。')
  console.log('定期的な監視と最適化の実施を推奨します。')
}

if (require.main === module) {
  main().catch(console.error)
}