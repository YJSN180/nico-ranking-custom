/**
 * タグ累積データをR2にアップロードするスクリプト
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { compressForStorage } from '../lib/unified-compression.js'

async function main() {
  console.log('📤 タグ累積データのR2アップロードを開始します...')

  // R2設定をenvから読み込み
  const r2Config = {
    endpoint: process.env.R2_ENDPOINT || 'https://5984977746a3dfcd71415bed5c324eb1.r2.cloudflarestorage.com',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    region: 'auto'
  }

  if (!r2Config.accessKeyId || !r2Config.secretAccessKey) {
    console.error('❌ R2認証情報が設定されていません')
    console.error('   .env.local に R2_ACCESS_KEY_ID と R2_SECRET_ACCESS_KEY を設定してください')
    process.exit(1)
  }

  const s3Client = new S3Client({
    endpoint: r2Config.endpoint,
    region: r2Config.region,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey
    }
  })

  const bucketName = 'nico-ranking'

  try {
    const jsonPath = join(process.cwd(), 'data', 'tag-accumulation.json')
    const jsonData = readFileSync(jsonPath, 'utf-8')
    const { compressedData, metadata } = await compressForStorage(jsonData)

    console.log('🗜️  canonical key を gzip 契約でアップロード中...')
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: 'tag-accumulation.json',
      Body: compressedData,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
      CacheControl: 'public, max-age=86400'
    })

    await s3Client.send(putCommand)
    console.log(
      `✅ tag-accumulation.json をアップロードしました (${(metadata.originalSize / 1024).toFixed(1)}KB -> ${(metadata.compressedSize / 1024).toFixed(1)}KB)`
    )

    console.log('\n🎉 アップロード完了！')
    console.log('   タグオートコンプリートAPIが利用可能になりました')
    console.log('   https://nico-rank.com/api/tags/autocomplete?q=検索文字')

  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
    process.exit(1)
  }
}

// 実行
main().catch(console.error)
