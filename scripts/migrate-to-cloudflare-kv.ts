#!/usr/bin/env node

/**
 * Vercel KVからCloudflare KVへのデータ移行スクリプト
 */

import { kv } from '@vercel/kv'
import { setRankingToKV, type KVRankingData } from '../lib/cloudflare-kv'
import { CACHED_GENRES } from '../types/ranking-config'
import type { RankingItem } from '../types/ranking'

async function migrateToCloudflareKV() {
  console.log('🚀 Vercel KVからCloudflare KVへのデータ移行を開始します...\n')

  const kvData: KVRankingData = {
    genres: {},
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 0
    }
  }

  const periods: ('24h' | 'hour')[] = ['24h', 'hour']
  let successCount = 0
  let errorCount = 0

  // 各ジャンルと期間のデータを収集
  for (const genre of CACHED_GENRES) {
    console.log(`📁 ${genre}ジャンルを処理中...`)
    
    if (!kvData.genres[genre]) {
      kvData.genres[genre] = {
        '24h': { items: [], popularTags: [], tags: {} },
        'hour': { items: [], popularTags: [], tags: {} }
      }
    }

    for (const period of periods) {
      try {
        // Vercel KVから読み取り
        const key = `ranking-${genre}-${period}`
        const data = await kv.get(key) as { items: RankingItem[], popularTags?: string[] } | null

        if (data && data.items) {
          kvData.genres[genre][period] = {
            items: data.items,
            popularTags: data.popularTags || [],
            tags: {}
          }
          kvData.metadata!.totalItems += data.items.length
          console.log(`  ✅ ${genre}/${period}: ${data.items.length}件`)
          successCount++

          // タグ別ランキングも移行（「その他」ジャンルのみ）
          if (genre === 'other' && data.popularTags && data.popularTags.length > 0) {
            console.log(`    📌 人気タグを処理中...`)
            for (const tag of data.popularTags) {
              try {
                const tagKey = `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
                const tagData = await kv.get(tagKey) as RankingItem[] | null

                if (tagData && tagData.length > 0) {
                  kvData.genres[genre][period].tags![tag] = tagData
                  console.log(`      ✅ ${tag}: ${tagData.length}件`)
                }
              } catch (tagError) {
                console.log(`      ❌ ${tag}: エラー`)
              }
            }
          }
        } else {
          console.log(`  ⚠️  ${genre}/${period}: データなし`)
        }
      } catch (error) {
        console.log(`  ❌ ${genre}/${period}: エラー - ${error}`)
        errorCount++
      }
    }
  }

  // Cloudflare KVに書き込み
  console.log('\n📤 Cloudflare KVに書き込み中...')
  try {
    await setRankingToKV(kvData)
    console.log('✅ Cloudflare KVへの書き込みが完了しました！')
    
    console.log('\n📊 移行結果:')
    console.log(`  - 成功: ${successCount}件`)
    console.log(`  - エラー: ${errorCount}件`)
    console.log(`  - 総アイテム数: ${kvData.metadata!.totalItems}件`)
    console.log(`  - データサイズ: 約${Math.round(JSON.stringify(kvData).length / 1024 / 1024 * 10) / 10}MB`)
  } catch (error) {
    console.error('❌ Cloudflare KVへの書き込みに失敗しました:', error)
  }
}

// 環境変数チェック
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('❌ Vercel KVの環境変数が設定されていません')
  console.error('以下の環境変数を設定してください:')
  console.error('  - KV_REST_API_URL')
  console.error('  - KV_REST_API_TOKEN')
  process.exit(1)
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_KV_NAMESPACE_ID || !process.env.CLOUDFLARE_KV_API_TOKEN) {
  console.error('❌ Cloudflare KVの環境変数が設定されていません')
  console.error('以下の環境変数を設定してください:')
  console.error('  - CLOUDFLARE_ACCOUNT_ID')
  console.error('  - CLOUDFLARE_KV_NAMESPACE_ID') 
  console.error('  - CLOUDFLARE_KV_API_TOKEN')
  process.exit(1)
}

// 実行
migrateToCloudflareKV().catch(console.error)