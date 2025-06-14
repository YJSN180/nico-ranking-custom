#!/usr/bin/env tsx
// 実際のKV使用状況をチェックするスクリプト

import { getRankingFromKV, getKVStats } from '@/lib/cloudflare-kv'

async function checkActualKVUsage() {
  console.log('=== 実際のKV使用状況チェック ===\n')
  
  try {
    // KVの統計情報を取得
    const stats = await getKVStats()
    console.log('KV統計情報:')
    console.log(`  データ存在: ${stats.hasData ? 'Yes' : 'No'}`)
    console.log(`  最終更新: ${stats.lastUpdated || 'N/A'}`)
    console.log(`  バージョン: ${stats.version || 'N/A'}`)
    
    if (!stats.hasData) {
      console.log('\n❌ KVにデータが存在しません')
      return
    }
    
    // 実際のデータを取得
    const data = await getRankingFromKV()
    
    if (!data) {
      console.log('\n❌ KVからデータを取得できませんでした')
      return
    }
    
    console.log('\n=== 実際のデータサイズ ===')
    
    // JSONにシリアライズしてサイズを測定
    const jsonString = JSON.stringify(data)
    const uncompressedSize = Buffer.byteLength(jsonString, 'utf8')
    
    console.log(`圧縮前サイズ: ${(uncompressedSize / 1024 / 1024).toFixed(2)} MB`)
    
    // ジャンル別の詳細
    let totalItems = 0
    let totalTags = 0
    
    console.log('\n=== ジャンル別詳細 ===')
    
    Object.entries(data.genres || {}).forEach(([genre, genreData]) => {
      console.log(`\n${genre}:`)
      
      Object.entries(genreData).forEach(([period, periodData]: [string, any]) => {
        const items = periodData.items?.length || 0
        const popularTags = periodData.popularTags?.length || 0
        const tagRankings = Object.keys(periodData.tags || {}).length
        
        totalItems += items
        totalTags += Object.values(periodData.tags || {}).reduce((sum: number, tagItems: any) => sum + (tagItems?.length || 0), 0)
        
        console.log(`  ${period}:`)
        console.log(`    基本ランキング: ${items}件`)
        console.log(`    人気タグ数: ${popularTags}`)
        console.log(`    タグ別ランキング: ${tagRankings}タグ`)
        
        if (periodData.tags) {
          Object.entries(periodData.tags).forEach(([tag, tagItems]: [string, any]) => {
            console.log(`      ${tag}: ${tagItems?.length || 0}件`)
          })
        }
      })
    })
    
    console.log('\n=== 総計 ===')
    console.log(`総アイテム数: ${totalItems + totalTags}件`)
    console.log(`基本ランキング: ${totalItems}件`)
    console.log(`タグ別ランキング: ${totalTags}件`)
    
    if (data.metadata) {
      console.log('\n=== メタデータ ===')
      console.log(`バージョン: ${data.metadata.version}`)
      console.log(`更新日時: ${data.metadata.updatedAt}`)
      console.log(`メタデータ記録の総アイテム数: ${data.metadata.totalItems}`)
    }
    
    // 推定圧縮サイズ
    const estimatedCompressedSize = uncompressedSize * 0.25 // 25%に圧縮
    console.log('\n=== 推定圧縮後サイズ ===')
    console.log(`推定圧縮サイズ: ${(estimatedCompressedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`無料枠に対する使用率: ${(estimatedCompressedSize / 1024 / 1024 / 1000 * 100).toFixed(2)}%`)
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
    
    if (error instanceof Error && error.message.includes('Cloudflare KV namespace not available')) {
      console.log('\n💡 これはNode.js環境での実行のため、Cloudflare KV REST APIを使用してください')
      console.log('環境変数の設定状況:')
      console.log(`  CLOUDFLARE_ACCOUNT_ID: ${process.env.CLOUDFLARE_ACCOUNT_ID ? 'Set' : 'Not set'}`)
      console.log(`  CLOUDFLARE_KV_NAMESPACE_ID: ${process.env.CLOUDFLARE_KV_NAMESPACE_ID ? 'Set' : 'Not set'}`)
      console.log(`  CLOUDFLARE_KV_API_TOKEN: ${process.env.CLOUDFLARE_KV_API_TOKEN ? 'Set (hidden)' : 'Not set'}`)
    }
  }
}

async function main() {
  await checkActualKVUsage()
}

if (require.main === module) {
  main().catch(console.error)
}