#!/usr/bin/env node
/**
 * R2への書き込みスクリプト（メタデータ対応版）
 * 人気タグの動的変化に対応し、効率的な読み込みを実現
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { compressForStorage } from '../lib/unified-compression.js'
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

// コンテンツのハッシュを計算
function calculateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

// R2から既存データを取得してハッシュを計算（圧縮対応）
async function getExistingContentHash(key: string): Promise<string | null> {
  try {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }))
    
    if (response.Body) {
      // Content-Encodingがgzipの場合は、圧縮されたデータのまま比較する
      const contentEncoding = response.ContentEncoding
      if (contentEncoding === 'gzip') {
        // 圧縮されたデータのハッシュを計算（バイナリデータのまま）
        const buffer = await response.Body.transformToByteArray()
        return createHash('sha256').update(buffer).digest('hex')
      } else {
        // 非圧縮データの場合は文字列として扱う
        const existingContent = await response.Body.transformToString()
        return calculateHash(existingContent)
      }
    }
  } catch (error: any) {
    // オブジェクトが存在しない場合はnullを返す
    if (error.Code === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null
    }
    console.error(`Error fetching ${key}:`, error)
  }
  return null
}

// 差分チェックとアップロード（統一圧縮システム対応）
async function uploadIfChanged(key: string, body: string, contentType: string, cacheControl: string, compress: boolean = false): Promise<boolean> {
  // 圧縮する場合は統一圧縮ライブラリを使用
  let newHash: string
  let uploadBody: string | Uint8Array = body
  let uploadContentType = contentType
  let uploadContentEncoding: string | undefined
  
  if (compress) {
    // 統一圧縮ライブラリを使用してWeb API標準でgzip圧縮
    const compressionResult = await compressForStorage(body)
    uploadBody = compressionResult.compressedData
    uploadContentEncoding = 'gzip'
    // 圧縮後のデータのハッシュを計算
    newHash = createHash('sha256').update(uploadBody).digest('hex')
    console.log(`🗜️  Compressed ${key}: ${(compressionResult.metadata.originalSize / 1024).toFixed(1)}KB → ${(compressionResult.metadata.compressedSize / 1024).toFixed(1)}KB (${compressionResult.metadata.compressionRatio.toFixed(1)}% reduction)`)
  } else {
    newHash = calculateHash(body)
  }
  
  const existingHash = await getExistingContentHash(key)
  
  // ハッシュが同じ場合はスキップ
  if (existingHash && existingHash === newHash) {
    console.log(`⏭️  Skipped ${key} (no changes)`)
    return false
  }
  
  // アップロード実行
  const putObjectParams: any = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: uploadBody,
    ContentType: uploadContentType,
    CacheControl: cacheControl,
  }
  
  // Content-Encodingヘッダーを設定
  if (uploadContentEncoding) {
    putObjectParams.ContentEncoding = uploadContentEncoding
  }
  
  await r2Client.send(new PutObjectCommand(putObjectParams))
  
  console.log(`✅ Uploaded ${key} (${compress ? 'compressed' : 'raw'})`)
  return true
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
      
      // 各動画のタグ数を集計
      const tagCounts: Record<string, number> = {}
      items.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
          item.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1
          })
        }
      })
      
      // 「すべて」のランキングデータを保存
      const allDataToStore: RankingData = {
        items: items,
        popularTags: popularTags,
        tags: tagCounts, // 各タグの出現回数を保存
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
        uploadIfChanged(allKey, allBody, 'application/json', 'public, max-age=1800', true) // gzip圧縮を有効化
          .then(uploaded => {
            if (uploaded) uploadCount++
          })
          .catch(error => {
            console.error(`❌ Failed to upload ${allKey}:`, error)
            throw error
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
          
          console.log(`  📝 Preparing to upload tag: ${tagKey}`)
          uploadPromises.push(
            uploadIfChanged(tagKey, tagBody, 'application/json', 'public, max-age=1800', true) // gzip圧縮を有効化
              .then(uploaded => {
                if (uploaded) {
                  uploadCount++
                  console.log(`  ✅ Successfully uploaded tag: ${tagKey}`)
                } else {
                  console.log(`  ⏭️ Skipped tag (no changes): ${tagKey}`)
                }
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
    uploadIfChanged(metadataKey, metadataBody, 'application/json', 'public, max-age=300', true) // gzip圧縮を有効化
      .then(uploaded => {
        if (uploaded) uploadCount++
      })
      .catch(error => {
        console.error(`❌ Failed to upload ${metadataKey}:`, error)
        // メタデータのアップロード失敗は警告のみ（必須ではない）
      })
  )

  // タグ累積データをアップロード（オートコンプリート用）
  console.log('\n🏷️  Uploading tag accumulation data...')
  const tagAccumulationPath = resolve(__dirname, '../tmp/tag-accumulation.json')
  if (existsSync(tagAccumulationPath)) {
    const tagAccumulationData = readFileSync(tagAccumulationPath, 'utf-8')
    const tagAccumulationKey = 'tag-accumulation.json'
    
    uploadPromises.push(
      uploadIfChanged(tagAccumulationKey, tagAccumulationData, 'application/json', 'public, max-age=86400', true) // 24時間キャッシュ、gzip圧縮
        .then(uploaded => {
          if (uploaded) {
            uploadCount++
            console.log('✅ Tag accumulation data uploaded successfully')
          } else {
            console.log('⏭️  Tag accumulation data skipped (no changes)')
          }
        })
        .catch(error => {
          console.error(`❌ Failed to upload tag accumulation data:`, error)
          // タグ累積データのアップロード失敗は警告のみ（オートコンプリートに影響するが必須ではない）
        })
    )
  } else {
    console.log('⚠️  Tag accumulation data not found, skipping...')
  }
  
  // すべてのアップロードを待つ
  await Promise.all(uploadPromises)
  
  const totalFiles = uploadPromises.length
  const skippedFiles = totalFiles - uploadCount
  
  console.log(`\n✨ Upload summary:`)
  console.log(`  - Total files processed: ${totalFiles}`)
  console.log(`  - Files uploaded: ${uploadCount}`)
  console.log(`  - Files skipped (no changes): ${skippedFiles}`)
  console.log(`  - Upload reduction: ${((skippedFiles / totalFiles) * 100).toFixed(1)}%`)
  
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