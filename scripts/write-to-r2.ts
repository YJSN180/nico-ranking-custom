#!/usr/bin/env npx tsx
/**
 * ランキングデータをCloudflare R2に書き込むスクリプト
 * GitHub Actionsから呼び出される
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { RankingData } from '../types/ranking'

// ESモジュールでの__dirname取得
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 環境変数から設定を読み込み
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
const BUCKET_NAME = 'nico-ranking'

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Error: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set')
  process.exit(1)
}

// R2クライアントの初期化
const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
})

// ジャンルと期間の定義
const GENRES = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
]

const PERIODS = ['24h', 'hour']

async function writeToR2() {
  console.log('🚀 Starting R2 upload process...')
  
  // 集約データファイルを読み込む
  const aggregatedDataPath = resolve(__dirname, '../tmp/latest-aggregated-data.json')
  const aggregatedData = JSON.parse(readFileSync(aggregatedDataPath, 'utf-8'))
  
  const uploadPromises: Promise<any>[] = []
  let uploadCount = 0
  
  // 各ジャンル・期間のデータを個別にアップロード
  for (const genre of GENRES) {
    for (const period of PERIODS) {
      const genreData = aggregatedData.genres[genre]?.[period]
      
      if (!genreData) {
        console.warn(`⚠️  No data found for ${genre}/${period}`)
        continue
      }
      
      const items = genreData.items || []
      
      // 注意: 現在のAPIレスポンスには個別動画のタグ情報が含まれていないため、
      // タグ集計は行わず、人気タグのみを保存します
      
      // R2に保存するデータ
      const dataToStore: RankingData = {
        items: items,
        popularTags: genreData.popularTags || [],
        tags: {}, // 現時点では個別動画のタグ情報は取得できないため空
        metadata: {
          version: 1,
          updatedAt: aggregatedData.metadata?.updatedAt || new Date().toISOString(),
          genre,
          period
        }
      }
      
      const key = `rankings/${genre}/${period}.json`
      const body = JSON.stringify(dataToStore)
      
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=1800', // 30分キャッシュ
      })
      
      // 並列アップロード
      uploadPromises.push(
        r2Client.send(putCommand)
          .then(() => {
            uploadCount++
            console.log(`✅ Uploaded ${key} (${(body.length / 1024).toFixed(1)}KB)`)
          })
          .catch(error => {
            console.error(`❌ Failed to upload ${key}:`, error)
            throw error
          })
      )
    }
  }
  
  // 全てのアップロードを待つ（部分的失敗を許容）
  const results = await Promise.allSettled(uploadPromises)
  
  // 成功/失敗をカウント
  const successCount = results.filter(r => r.status === 'fulfilled').length
  const failureCount = results.filter(r => r.status === 'rejected').length
  
  console.log(`\n📊 Upload Results: ${successCount} succeeded, ${failureCount} failed`)
  
  if (failureCount > 0) {
    // 失敗したアップロードの詳細を表示
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const genreIndex = Math.floor(index / PERIODS.length)
        const periodIndex = index % PERIODS.length
        const genre = GENRES[genreIndex]
        const period = PERIODS[periodIndex]
        console.error(`❌ Failed: ${genre}/${period} - ${result.reason}`)
      }
    })
    
    // 50%以上失敗した場合はエラー終了
    if (failureCount > successCount) {
      console.error('❌ Too many uploads failed (>50%). Aborting.')
      process.exit(1)
    }
  }
  
  // メタデータをアップロード（成功した分の情報を含む）
  const metadataKey = 'metadata.json'
  const metadataCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: metadataKey,
    Body: JSON.stringify({
      lastUpdated: new Date().toISOString(),
      totalFiles: uploadCount,
      successfulUploads: successCount,
      failedUploads: failureCount,
      version: 1
    }),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300' // 5分キャッシュ
  })
  
  try {
    await r2Client.send(metadataCommand)
    console.log(`✅ Uploaded ${metadataKey}`)
  } catch (error) {
    console.error(`❌ Failed to upload metadata:`, error)
    // メタデータのアップロード失敗は致命的エラーとしない
  }
  
  if (successCount > 0) {
    console.log(`\n✨ Successfully uploaded ${successCount} files to R2`)
  }
}

// メイン実行
writeToR2().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})