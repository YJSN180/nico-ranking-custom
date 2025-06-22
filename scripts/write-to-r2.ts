#!/usr/bin/env npx tsx
/**
 * ランキングデータをCloudflare R2に書き込むスクリプト
 * GitHub Actionsから呼び出される
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { RankingData } from '../types/ranking'

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
      
      // R2に保存するデータ
      const dataToStore: RankingData = {
        items: genreData.items || [],
        popularTags: genreData.popularTags || [],
        metadata: {
          version: 1,
          updatedAt: aggregatedData.metadata?.updatedAt || new Date().toISOString(),
          genre,
          period
        }
      }
      
      // タグデータがある場合は追加
      if (genreData.tags) {
        dataToStore.tags = genreData.tags
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
  
  // 全てのアップロードを待つ
  try {
    await Promise.all(uploadPromises)
    console.log(`\n✨ Successfully uploaded ${uploadCount} files to R2`)
    
    // メタデータをアップロード（最新更新時刻など）
    const metadataKey = 'metadata.json'
    const metadataCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: metadataKey,
      Body: JSON.stringify({
        lastUpdated: new Date().toISOString(),
        totalFiles: uploadCount,
        version: 1
      }),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300' // 5分キャッシュ
    })
    
    await r2Client.send(metadataCommand)
    console.log(`✅ Uploaded ${metadataKey}`)
    
  } catch (error) {
    console.error('❌ R2 upload failed:', error)
    process.exit(1)
  }
}

// メイン実行
writeToR2().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})