#!/usr/bin/env node
/**
 * R2への書き込みスクリプト（メタデータ対応版）
 * 人気タグの動的変化に対応し、効率的な読み込みを実現
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { RankingData } from '../app/types/ranking'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// R2クライアントの設定
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET_NAME = 'nico-ranking'

// ジャンルと期間の定義
const GENRES = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
]

const PERIODS = ['24h', 'hour']

interface TagMetadata {
  tags: string[]
  updatedAt: string
}

async function writeToR2() {
  console.log('🚀 Starting R2 upload process with metadata support...')
  
  // 集約データファイルを読み込む
  const aggregatedDataPath = resolve(__dirname, '../tmp/latest-aggregated-data.json')
  console.log(`📂 Loading aggregated data from: ${aggregatedDataPath}`)
  
  // ファイルの存在確認
  if (!existsSync(aggregatedDataPath)) {
    console.error(`❌ Aggregated data file not found: ${aggregatedDataPath}`)
    throw new Error('Aggregated data file not found')
  }
  
  const aggregatedData = JSON.parse(readFileSync(aggregatedDataPath, 'utf-8'))
  
  // デバッグ: aggregatedDataの構造を確認
  console.log('\n📊 Aggregated data structure:')
  console.log(`  - Genres: ${Object.keys(aggregatedData.genres || {}).length}`)
  if (aggregatedData.genres) {
    const firstGenre = Object.keys(aggregatedData.genres)[0]
    if (firstGenre && aggregatedData.genres[firstGenre]) {
      console.log(`  - Sample genre (${firstGenre}): ${JSON.stringify(Object.keys(aggregatedData.genres[firstGenre]))}`)
      const firstPeriod = Object.keys(aggregatedData.genres[firstGenre])[0]
      if (firstPeriod && aggregatedData.genres[firstGenre][firstPeriod]) {
        const periodData = aggregatedData.genres[firstGenre][firstPeriod]
        console.log(`  - Sample period data (${firstGenre}/${firstPeriod}):`)
        console.log(`    - Has items: ${!!periodData.items} (count: ${periodData.items?.length || 0})`)
        console.log(`    - Has popularTags: ${!!periodData.popularTags} (count: ${periodData.popularTags?.length || 0})`)
        console.log(`    - Has tags: ${!!periodData.tags} (count: ${periodData.tags ? Object.keys(periodData.tags).length : 0})`)
        if (periodData.tags && Object.keys(periodData.tags).length > 0) {
          console.log(`    - First 3 tags: ${Object.keys(periodData.tags).slice(0, 3).join(', ')}`)
        }
      }
    }
  }
  
  const uploadPromises: Promise<any>[] = []
  let uploadCount = 0
  const tagMetadataByGenrePeriod: Record<string, TagMetadata> = {}
  
  // 各ジャンル・期間のデータを個別にアップロード
  for (const genre of GENRES) {
    for (const period of PERIODS) {
      const genreData = aggregatedData.genres[genre]?.[period]
      
      if (!genreData) {
        console.warn(`⚠️  No data found for ${genre}/${period}`)
        continue
      }
      
      // デバッグ: genreDataの構造を確認
      console.log(`\n🔍 Debug ${genre}/${period}: has tags? ${!!genreData.tags}, tag count: ${genreData.tags ? Object.keys(genreData.tags).length : 0}`)
      if (genreData.tags && Object.keys(genreData.tags).length > 0) {
        console.log(`  - First 3 tags: ${Object.keys(genreData.tags).slice(0, 3).join(', ')}`)
      }
      
      const items = genreData.items || []
      const popularTags = genreData.popularTags || []
      
      // メタデータの記録
      const metadataKey = `${genre}/${period}`
      tagMetadataByGenrePeriod[metadataKey] = {
        tags: genreData.tags ? Object.keys(genreData.tags) : [],
        updatedAt: aggregatedData.metadata?.updatedAt || new Date().toISOString()
      }
      
      // 「すべて」のランキングデータを保存
      const allDataToStore: RankingData = {
        items: items,
        popularTags: popularTags,
        tags: {}, // 個別動画のタグ情報は現時点では取得できないため空
        metadata: {
          version: 1,
          updatedAt: aggregatedData.metadata?.updatedAt || new Date().toISOString(),
          genre,
          period
        }
      }
      
      // 新形式のキー（genre/period/all.json）
      const allKey = `rankings/${genre}/${period}/all.json`
      const allBody = JSON.stringify(allDataToStore)
      
      uploadPromises.push(
        r2Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: allKey,
          Body: allBody,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=1800', // 30分キャッシュ
        }))
          .then(() => {
            uploadCount++
            console.log(`✅ Uploaded ${allKey} (${(allBody.length / 1024).toFixed(1)}KB)`)
          })
          .catch(error => {
            console.error(`❌ Failed to upload ${allKey}:`, error)
            throw error
          })
      )
      
      // 旧形式のキーにも保存（後方互換性のため）
      const legacyKey = `rankings/${genre}/${period}.json`
      uploadPromises.push(
        r2Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: legacyKey,
          Body: allBody,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=1800', // 30分キャッシュ
        }))
          .then(() => {
            uploadCount++
            console.log(`✅ Uploaded ${legacyKey} (legacy format)`)
          })
          .catch(error => {
            console.error(`❌ Failed to upload ${legacyKey}:`, error)
            // 旧形式の失敗は無視（新形式が成功していればOK）
          })
      )
      
      // タグ別ランキングデータを個別に保存
      if (genreData.tags && Object.keys(genreData.tags).length > 0) {
        console.log(`📦 Processing ${Object.keys(genreData.tags).length} tags for ${genre}/${period}`)
        for (const [tag, tagItems] of Object.entries(genreData.tags)) {
          const tagDataToStore: RankingData = {
            items: tagItems as any[],
            popularTags: popularTags,
            tags: {}, // タグ別データには不要
            metadata: {
              version: 1,
              updatedAt: aggregatedData.metadata?.updatedAt || new Date().toISOString(),
              genre,
              period,
              tag
            }
          }
          
          // タグ名をURLセーフにエンコード
          const encodedTag = encodeURIComponent(tag)
          const tagKey = `rankings/${genre}/${period}/tags/${encodedTag}.json`
          const tagBody = JSON.stringify(tagDataToStore)
          
          uploadPromises.push(
            r2Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: tagKey,
              Body: tagBody,
              ContentType: 'application/json',
              CacheControl: 'public, max-age=1800', // 30分キャッシュ
            }))
              .then(() => {
                uploadCount++
                console.log(`✅ Uploaded ${tagKey} (${(tagBody.length / 1024).toFixed(1)}KB)`)
              })
              .catch(error => {
                console.error(`❌ Failed to upload ${tagKey}:`, error)
                throw error
              })
          )
        }
      } else {
        console.log(`⚠️  No tags found for ${genre}/${period}`)
      }
    }
  }
  
  // メタデータファイルをアップロード
  console.log('\n📋 Uploading metadata file...')
  const metadataKey = 'rankings/metadata.json'
  const metadataBody = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    tagsByGenrePeriod: tagMetadataByGenrePeriod
  })
  
  uploadPromises.push(
    r2Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: metadataKey,
      Body: metadataBody,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300', // 5分キャッシュ（頻繁に更新される可能性があるため短め）
    }))
      .then(() => {
        uploadCount++
        console.log(`✅ Uploaded ${metadataKey} (${(metadataBody.length / 1024).toFixed(1)}KB)`)
      })
      .catch(error => {
        console.error(`❌ Failed to upload ${metadataKey}:`, error)
        // メタデータのアップロード失敗は警告のみ（必須ではない）
      })
  )
  
  // すべてのアップロードを待つ
  await Promise.all(uploadPromises)
  
  console.log(`\n✨ Successfully uploaded ${uploadCount} files to R2`)
  
  // メタデータのサマリーを表示
  console.log('\n📊 Tag metadata summary:')
  for (const [key, metadata] of Object.entries(tagMetadataByGenrePeriod)) {
    if (metadata.tags.length > 0) {
      console.log(`  - ${key}: ${metadata.tags.length} tags`)
    }
  }
}

// エラーハンドリング付きで実行
writeToR2().catch(error => {
  console.error('Failed to write to R2:', error)
  process.exit(1)
})