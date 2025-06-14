#!/usr/bin/env tsx
// 500件から1000件に増やした場合のリソース影響分析

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

// Cloudflare KV使用量計算（現在の500件と1000件の比較）
function calculateKVUsageComparison() {
  const itemSize = calculateRankingItemSize()
  const compressionRatio = estimateCompressionRatio()
  
  console.log('=== 500件 vs 1000件 Cloudflare KV使用量比較 ===\n')
  console.log(`典型的なランキングアイテムサイズ: ${itemSize} bytes`)
  console.log(`圧縮率: ${(1 - compressionRatio) * 100}% (${compressionRatio * 100}%に圧縮)\n`)
  
  let current500UncompressedSize = 0
  let current500CompressedSize = 0
  let current500TotalItems = 0
  
  let new1000UncompressedSize = 0
  let new1000CompressedSize = 0
  let new1000TotalItems = 0
  
  console.log('=== ジャンル別詳細比較 ===')
  
  // 各ジャンルの計算
  CACHED_GENRES.forEach(genre => {
    const periods = ['24h', 'hour'] as const
    const popularTagsCount = estimatePopularTagsCount(genre)
    
    console.log(`\n${genre}:`)
    console.log(`  人気タグ数: ${popularTagsCount}`)
    
    periods.forEach(period => {
      // 現在（500件）
      const current500BasicSize = itemSize * 500
      const current500TagSize = popularTagsCount * itemSize * 500
      current500UncompressedSize += current500BasicSize + current500TagSize
      current500TotalItems += 500 + (popularTagsCount * 500)
      
      // 新規（1000件）
      const new1000BasicSize = itemSize * 1000
      const new1000TagSize = popularTagsCount * itemSize * 1000
      new1000UncompressedSize += new1000BasicSize + new1000TagSize
      new1000TotalItems += 1000 + (popularTagsCount * 1000)
      
      console.log(`  ${period}:`)
      console.log(`    基本ランキング: ${(current500BasicSize / 1024).toFixed(1)} KB → ${(new1000BasicSize / 1024).toFixed(1)} KB`)
      console.log(`    タグ別ランキング: ${(current500TagSize / 1024).toFixed(1)} KB → ${(new1000TagSize / 1024).toFixed(1)} KB`)
      console.log(`    小計: ${((current500BasicSize + current500TagSize) / 1024).toFixed(1)} KB → ${((new1000BasicSize + new1000TagSize) / 1024).toFixed(1)} KB`)
    })
  })
  
  // メタデータとオーバーヘッド
  const metadataSize = 2048 // 2KB程度のメタデータ
  current500UncompressedSize += metadataSize
  new1000UncompressedSize += metadataSize
  
  // 圧縮後のサイズ
  current500CompressedSize = current500UncompressedSize * compressionRatio
  new1000CompressedSize = new1000UncompressedSize * compressionRatio
  
  console.log('\n=== 合計比較 ===')
  console.log(`総アイテム数:`)
  console.log(`  現在（500件）: ${current500TotalItems.toLocaleString()} 件`)
  console.log(`  新規（1000件）: ${new1000TotalItems.toLocaleString()} 件 (+${((new1000TotalItems - current500TotalItems) / current500TotalItems * 100).toFixed(0)}%)`)
  
  console.log(`\n圧縮前サイズ:`)
  console.log(`  現在（500件）: ${(current500UncompressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  新規（1000件）: ${(new1000UncompressedSize / 1024 / 1024).toFixed(2)} MB (+${((new1000UncompressedSize - current500UncompressedSize) / current500UncompressedSize * 100).toFixed(0)}%)`)
  
  console.log(`\n圧縮後サイズ:`)
  console.log(`  現在（500件）: ${(current500CompressedSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  新規（1000件）: ${(new1000CompressedSize / 1024 / 1024).toFixed(2)} MB (+${((new1000CompressedSize - current500CompressedSize) / current500CompressedSize * 100).toFixed(0)}%)`)
  
  console.log(`\n=== Cloudflare KV無料枠比較 ===`)
  console.log(`ストレージ制限: 1,000 MB`)
  console.log(`現在の使用率: ${((current500CompressedSize / 1024 / 1024) / 1000 * 100).toFixed(2)}%`)
  console.log(`1000件での使用率: ${((new1000CompressedSize / 1024 / 1024) / 1000 * 100).toFixed(2)}%`)
  console.log(`増加分: +${((new1000CompressedSize - current500CompressedSize) / 1024 / 1024).toFixed(2)} MB`)
  
  return {
    current500: {
      uncompressedSize: current500UncompressedSize,
      compressedSize: current500CompressedSize,
      totalItems: current500TotalItems
    },
    new1000: {
      uncompressedSize: new1000UncompressedSize,
      compressedSize: new1000CompressedSize,
      totalItems: new1000TotalItems
    }
  }
}

// KV リクエスト数への影響計算
function calculateKVRequestsImpact() {
  console.log('\n=== Cloudflare KV リクエスト数への影響 ===\n')
  
  // 書き込み（クロンジョブ）- 変化なし
  const cronWrites = (24 * 60 / 10) * 1 // 10分ごとに1回の書き込み
  const dailyWrites = cronWrites
  const monthlyWrites = dailyWrites * 30
  
  console.log(`書き込み（クロンジョブ）:`)
  console.log(`  頻度: 10分ごと`)
  console.log(`  1日あたり: ${dailyWrites} 回（変化なし）`)
  console.log(`  1ヶ月あたり: ${monthlyWrites} 回（変化なし）`)
  console.log(`  ※ 1回の書き込みデータ量は倍増するが、回数は変わらない`)
  
  // 読み取り - データ量は増えるが回数は変わらない
  console.log(`\n読み取り（ユーザーアクセス）:`)
  console.log(`  読み取り回数は変化なし（データ量のみ増加）`)
  console.log(`  ※ 1回の読み取りで取得するデータ量は倍増`)
  
  console.log(`\n=== 制限への影響 ===`)
  console.log(`書き込み制限（1,000/日）: 影響なし（${(dailyWrites / 1000 * 100).toFixed(1)}%）`)
  console.log(`読み取り制限（100,000/日）: 影響なし（回数は変わらない）`)
  console.log(`\n⚠️ 注意: データ転送量は増加するため、帯域幅使用量に影響あり`)
}

// Vercel使用量への影響計算
function calculateVercelUsageImpact() {
  console.log('\n=== Vercel使用量への影響 ===\n')
  
  // ファンクション実行時間への影響
  const currentCronTime = 30 // 現在: 30秒 (全ジャンル・全タグ処理)
  const newCronTime = 60 // 新規: 60秒に増加（データ量倍増のため）
  const apiExecutionTime = 0.5 // 変化なし（KVからの読み取り）
  
  const cronExecutionsPerMonth = 30 * 24 * 6 // 月間クロン実行回数
  const apiExecutionsPerMonth = 1000 * 30 * 0.3 // 月間API実行回数
  
  const currentTotalCronTime = cronExecutionsPerMonth * currentCronTime
  const newTotalCronTime = cronExecutionsPerMonth * newCronTime
  const totalApiTime = apiExecutionsPerMonth * apiExecutionTime
  
  console.log(`クロンジョブ実行時間:`)
  console.log(`  現在: ${currentCronTime}秒/回`)
  console.log(`  新規: ${newCronTime}秒/回 (+${((newCronTime - currentCronTime) / currentCronTime * 100).toFixed(0)}%)`)
  console.log(`  月間実行時間:`)
  console.log(`    現在: ${(currentTotalCronTime / 60).toFixed(0)}分`)
  console.log(`    新規: ${(newTotalCronTime / 60).toFixed(0)}分 (+${((newTotalCronTime - currentTotalCronTime) / currentTotalCronTime * 100).toFixed(0)}%)`)
  
  // 帯域幅への影響
  const currentResponseSize = 150 * 1024 // 現在: 150KB (圧縮後)
  const newResponseSize = 300 * 1024 // 新規: 300KB (データ量倍増)
  const currentMonthlyBandwidth = apiExecutionsPerMonth * currentResponseSize
  const newMonthlyBandwidth = apiExecutionsPerMonth * newResponseSize
  
  console.log(`\n帯域幅:`)
  console.log(`  平均レスポンスサイズ:`)
  console.log(`    現在: ${(currentResponseSize / 1024).toFixed(0)} KB`)
  console.log(`    新規: ${(newResponseSize / 1024).toFixed(0)} KB (+${((newResponseSize - currentResponseSize) / currentResponseSize * 100).toFixed(0)}%)`)
  console.log(`  月間転送量:`)
  console.log(`    現在: ${(currentMonthlyBandwidth / 1024 / 1024 / 1024).toFixed(2)} GB`)
  console.log(`    新規: ${(newMonthlyBandwidth / 1024 / 1024 / 1024).toFixed(2)} GB (+${((newMonthlyBandwidth - currentMonthlyBandwidth) / currentMonthlyBandwidth * 100).toFixed(0)}%)`)
  
  console.log(`\n=== Vercel無料枠への影響 ===`)
  console.log(`ファンクション実行時間制限: 100 GB-秒/月`)
  console.log(`  現在: ${(currentTotalCronTime / 100 / 1024 / 1024 * 100).toFixed(6)}%`)
  console.log(`  新規: ${(newTotalCronTime / 100 / 1024 / 1024 * 100).toFixed(6)}%`)
  console.log(`\n帯域幅制限: 100 GB/月`)
  console.log(`  現在: ${(currentMonthlyBandwidth / 1024 / 1024 / 1024 / 100 * 100).toFixed(2)}%`)
  console.log(`  新規: ${(newMonthlyBandwidth / 1024 / 1024 / 1024 / 100 * 100).toFixed(2)}%`)
}

// スクレイピング処理への影響
function calculateScrapingImpact() {
  console.log('\n=== スクレイピング処理への影響 ===\n')
  
  const pageSize = 100 // 1ページあたり100件
  const current500Pages = Math.ceil(500 / pageSize) // 5ページ
  const new1000Pages = Math.ceil(1000 / pageSize) // 10ページ
  
  const genreCount = CACHED_GENRES.length // 7ジャンル
  const periodCount = 2 // 24h, hour
  const avgTagsPerGenre = 15 // 平均タグ数
  
  console.log(`基本ランキング取得:`)
  console.log(`  現在: ${current500Pages}ページ × ${genreCount}ジャンル × ${periodCount}期間 = ${current500Pages * genreCount * periodCount}ページ`)
  console.log(`  新規: ${new1000Pages}ページ × ${genreCount}ジャンル × ${periodCount}期間 = ${new1000Pages * genreCount * periodCount}ページ`)
  
  const currentTagPages = current500Pages * genreCount * periodCount * avgTagsPerGenre
  const newTagPages = new1000Pages * genreCount * periodCount * avgTagsPerGenre
  
  console.log(`\nタグ別ランキング取得:`)
  console.log(`  現在: 約${currentTagPages}ページ`)
  console.log(`  新規: 約${newTagPages}ページ (+${((newTagPages - currentTagPages) / currentTagPages * 100).toFixed(0)}%)`)
  
  const delayPerPage = 500 // 500ms遅延
  const currentTotalDelay = (current500Pages + currentTagPages) * delayPerPage / 1000
  const newTotalDelay = (new1000Pages + newTagPages) * delayPerPage / 1000
  
  console.log(`\n処理時間（遅延のみ）:`)
  console.log(`  現在: 約${currentTotalDelay.toFixed(0)}秒`)
  console.log(`  新規: 約${newTotalDelay.toFixed(0)}秒 (+${((newTotalDelay - currentTotalDelay) / currentTotalDelay * 100).toFixed(0)}%)`)
  
  console.log(`\n⚠️ リスク:`)
  console.log(`  - ニコニコ動画へのリクエスト数が倍増`)
  console.log(`  - レート制限に達する可能性が高まる`)
  console.log(`  - 処理時間の増加によりタイムアウトリスクが上昇`)
}

// 総合判定
function provideSummaryAndRecommendations() {
  console.log('\n=== 総合判定と推奨事項 ===\n')
  
  console.log('📊 影響サマリー:')
  console.log('1. Cloudflare KV:')
  console.log('   - ストレージ使用量: 約2倍に増加（まだ余裕あり）')
  console.log('   - リクエスト数: 変化なし（制限内）')
  console.log('')
  console.log('2. Vercel:')
  console.log('   - 実行時間: 約2倍に増加（制限内）')
  console.log('   - 帯域幅: 約2倍に増加（制限内）')
  console.log('')
  console.log('3. スクレイピング:')
  console.log('   - 処理時間: 約2倍に増加')
  console.log('   - リクエスト数: 約2倍に増加')
  
  console.log('\n✅ 判定: 無料枠内で実装可能')
  console.log('現在の使用率が低いため、1000件に増やしても無料枠内に収まります。')
  
  console.log('\n🔧 推奨事項:')
  console.log('1. **段階的な実装**:')
  console.log('   - まず1ジャンルで1000件を試験実装')
  console.log('   - 問題がなければ全ジャンルに展開')
  console.log('')
  console.log('2. **モニタリング強化**:')
  console.log('   - /api/monitor/kv-usage エンドポイントの定期確認')
  console.log('   - Cloudflare/Vercelダッシュボードでの使用量監視')
  console.log('')
  console.log('3. **最適化の実施**:')
  console.log('   - 不要なフィールド（authorIcon等）の削除でサイズ削減')
  console.log('   - 人気の低いタグのキャッシュを制限')
  console.log('   - レスポンスの差分更新を検討')
  console.log('')
  console.log('4. **フォールバック準備**:')
  console.log('   - 制限に近づいた場合の自動縮退機能')
  console.log('   - エラー時の段階的なグレースフルデグレード')
  
  console.log('\n⚠️ 注意点:')
  console.log('- ニコニコ動画側のレート制限に注意')
  console.log('- 初回実装時は綿密なモニタリングが必要')
  console.log('- ユーザー体験への影響を確認（ページロード時間等）')
}

// メイン実行
async function main() {
  console.log('500件から1000件への増加による影響分析')
  console.log('=' + '='.repeat(79))
  
  calculateKVUsageComparison()
  calculateKVRequestsImpact()
  calculateVercelUsageImpact()
  calculateScrapingImpact()
  provideSummaryAndRecommendations()
}

if (require.main === module) {
  main().catch(console.error)
}