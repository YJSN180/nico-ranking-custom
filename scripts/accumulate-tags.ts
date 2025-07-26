#!/usr/bin/env npx tsx
/**
 * タグ累積・保存スクリプト
 * ランキングデータからすべてのタグを抽出し、R2に累積的に保存
 * オートコンプリート機能で使用
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { KVRankingData, RankingItem, TagDetail } from '../types/ranking'

// R2に保存するタグデータの構造
interface TagAccumulationData {
  tags: string[]  // 累積されたタグリスト（重複なし、50音順）
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount: number  // 週次更新回数
  }
}

// Cloudflare R2からタグデータを取得
async function getExistingTagsFromR2(): Promise<TagAccumulationData> {
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CF_ACCOUNT_ID) {
    console.log('R2 credentials not found, starting with empty tag list')
    return {
      tags: [],
      metadata: {
        version: 1,
        lastUpdated: new Date().toISOString(),
        totalUniqueTags: 0,
        lastAccumulationSource: 'initial',
        weeklyUpdateCount: 1
      }
    }
  }

  try {
    // R2 API endpoint for nico-ranking bucket
    const endpoint = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const url = `${endpoint}/nico-ranking/tag-accumulation.json`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/...`,
        // Note: In a real implementation, we'd need to properly sign the request
        // For now, we'll use a simpler approach via Workers
      }
    })

    if (response.ok) {
      const existingData = await response.json() as TagAccumulationData
      console.log(`📥 Loaded existing tags: ${existingData.metadata.totalUniqueTags} unique tags`)
      return existingData
    } else {
      console.log('No existing tag data found in R2, starting fresh')
    }
  } catch (error) {
    console.log('Error loading existing tags:', error)
  }

  // Return default structure if loading fails
  return {
    tags: [],
    metadata: {
      version: 1,
      lastUpdated: new Date().toISOString(),
      totalUniqueTags: 0,
      lastAccumulationSource: 'initial',
      weeklyUpdateCount: 1
    }
  }
}

// タグデータをR2に保存
async function saveTagsToR2(tagData: TagAccumulationData): Promise<void> {
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CF_ACCOUNT_ID) {
    throw new Error('R2 credentials not configured')
  }

  // Note: For this demo, we'll save to a local file and let the existing
  // write-to-r2.ts script handle the actual R2 upload
  const outputPath = path.join(process.cwd(), 'tmp', 'tag-accumulation.json')
  await fs.writeFile(outputPath, JSON.stringify(tagData, null, 2))
  console.log(`💾 Saved tag data to ${outputPath} for R2 upload`)
}

// KVランキングデータからタグを抽出
function extractTagsFromKVData(kvData: KVRankingData): Set<string> {
  const allTags = new Set<string>()

  for (const [genre, genreData] of Object.entries(kvData.genres)) {
    // 24時間ランキングからタグ抽出
    if (genreData['24h']) {
      // アイテムレベルのタグ
      for (const item of genreData['24h'].items) {
        if (item.tags) {
          item.tags.forEach(tag => allTags.add(tag))
        }
        if (item.tagDetails) {
          item.tagDetails.forEach(detail => allTags.add(detail.name))
        }
      }

      // 人気タグ
      if (genreData['24h'].popularTags) {
        genreData['24h'].popularTags.forEach(tag => allTags.add(tag))
      }

      // タグランキング
      if (genreData['24h'].tags) {
        Object.keys(genreData['24h'].tags).forEach(tag => allTags.add(tag))
      }
    }

    // 1時間ランキングからタグ抽出（重複は自動的に除外される）
    if (genreData['hour']) {
      for (const item of genreData['hour'].items) {
        if (item.tags) {
          item.tags.forEach(tag => allTags.add(tag))
        }
        if (item.tagDetails) {
          item.tagDetails.forEach(detail => allTags.add(detail.name))
        }
      }

      if (genreData['hour'].popularTags) {
        genreData['hour'].popularTags.forEach(tag => allTags.add(tag))
      }

      if (genreData['hour'].tags) {
        Object.keys(genreData['hour'].tags).forEach(tag => allTags.add(tag))
      }
    }
  }

  return allTags
}

// 部分的結果ファイルからタグを抽出（GitHub Actions実行中用）
async function extractTagsFromPartialResults(): Promise<Set<string>> {
  const allTags = new Set<string>()
  const tmpDir = './tmp'

  try {
    const files = await fs.readdir(tmpDir)
    const groupFiles = files.filter(f => f.startsWith('ranking-group-') && f.endsWith('.json'))
    
    console.log(`📂 Found ${groupFiles.length} group result files`)

    for (const file of groupFiles) {
      console.log(`🔍 Processing ${file}...`)
      const content = await fs.readFile(path.join(tmpDir, file), 'utf-8')
      
      try {
        const results = JSON.parse(content)
        if (!Array.isArray(results)) continue

        for (const result of results) {
          if (!result?.data) continue

          // 24時間ランキング
          if (result.data['24h']) {
            const data = result.data['24h']
            
            // アイテムからタグ抽出
            if (data.items) {
              for (const item of data.items) {
                if (item.tags) {
                  item.tags.forEach((tag: string) => allTags.add(tag))
                }
                if (item.tagDetails) {
                  item.tagDetails.forEach((detail: TagDetail) => allTags.add(detail.name))
                }
              }
            }

            // 人気タグ
            if (data.popularTags) {
              data.popularTags.forEach((tag: string) => allTags.add(tag))
            }

            // タグランキング
            if (data.tags) {
              Object.keys(data.tags).forEach(tag => allTags.add(tag))
            }
          }

          // 1時間ランキング
          if (result.data['hour']) {
            const data = result.data['hour']
            
            // アイテムからタグ抽出
            if (data.items) {
              for (const item of data.items) {
                if (item.tags) {
                  item.tags.forEach((tag: string) => allTags.add(tag))
                }
                if (item.tagDetails) {
                  item.tagDetails.forEach((detail: TagDetail) => allTags.add(detail.name))
                }
              }
            }

            // 人気タグ
            if (data.popularTags) {
              data.popularTags.forEach((tag: string) => allTags.add(tag))
            }

            // タグランキング
            if (data.tags) {
              Object.keys(data.tags).forEach(tag => allTags.add(tag))
            }
          }
        }
      } catch (error) {
        console.error(`Error parsing ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Error reading tmp directory:', error)
  }

  return allTags
}

// KVから既存データを読み込み（フォールバック用）
async function extractTagsFromKV(): Promise<Set<string>> {
  const allTags = new Set<string>()
  
  try {
    // KVからランキングデータを読み込み
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      console.log('KV credentials not found, skipping KV extraction')
      return allTags
    }

    // 3つのグループからデータを読み込み
    for (let groupId = 1; groupId <= 3; groupId++) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_GROUP_${groupId}`
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          },
        })

        if (response.ok) {
          const kvData = await response.json() as KVRankingData
          const groupTags = extractTagsFromKVData(kvData)
          groupTags.forEach(tag => allTags.add(tag))
          console.log(`📊 Extracted ${groupTags.size} tags from KV group ${groupId}`)
        }
      } catch (error) {
        console.log(`Error reading KV group ${groupId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error extracting tags from KV:', error)
  }

  return allTags
}

// 文字列の50音順ソート（ひらがな・カタカナ・漢字・英数字の順）
function sortTagsJapanese(tags: string[]): string[] {
  return tags.sort((a, b) => {
    return a.localeCompare(b, 'ja', { 
      numeric: true,
      caseFirst: 'lower'
    })
  })
}

// タグのクリーニング（重複除去、空文字除去、トリム）
function cleanTags(tags: string[]): string[] {
  const cleanedTags = Array.from(new Set(
    tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .filter(tag => tag.length <= 100) // 異常に長いタグを除外
  ))
  
  return sortTagsJapanese(cleanedTags)
}

// メイン処理
async function main() {
  try {
    console.log('🏷️  Starting tag accumulation process...')
    
    // 1. 既存のタグデータを読み込み
    const existingData = await getExistingTagsFromR2()
    const existingTags = new Set(existingData.tags)
    console.log(`📋 Existing tags: ${existingTags.size}`)

    // 2. 新しいタグを抽出（複数ソースから）
    let newTags = new Set<string>()

    // 2a. GitHub Actions実行中の場合：部分的結果から抽出
    console.log('🔍 Extracting tags from partial results...')
    const partialTags = await extractTagsFromPartialResults()
    partialTags.forEach(tag => newTags.add(tag))
    console.log(`📂 Found ${partialTags.size} tags from partial results`)

    // 2b. フォールバック：KVから直接抽出
    if (newTags.size === 0) {
      console.log('🔄 No partial results, extracting from KV...')
      const kvTags = await extractTagsFromKV()
      kvTags.forEach(tag => newTags.add(tag))
      console.log(`📊 Found ${kvTags.size} tags from KV`)
    }

    // 3. 既存タグとマージ
    const allTags = new Set([...existingTags, ...newTags])
    const newTagsCount = allTags.size - existingTags.size
    console.log(`✨ Found ${newTagsCount} new unique tags`)

    // 4. タグをクリーニング・ソート
    const cleanedTags = cleanTags(Array.from(allTags))
    console.log(`🧹 After cleaning: ${cleanedTags.length} tags`)

    // 5. 更新されたデータ構造を作成
    const updatedData: TagAccumulationData = {
      tags: cleanedTags,
      metadata: {
        version: existingData.metadata.version + 1,
        lastUpdated: new Date().toISOString(),
        totalUniqueTags: cleanedTags.length,
        lastAccumulationSource: partialTags.size > 0 ? 'partial-results' : 'kv-fallback',
        weeklyUpdateCount: existingData.metadata.weeklyUpdateCount + 1
      }
    }

    // 6. R2に保存
    await saveTagsToR2(updatedData)

    // 7. 統計表示
    console.log('\n📊 Tag Accumulation Summary:')
    console.log(`  Total unique tags: ${updatedData.metadata.totalUniqueTags}`)
    console.log(`  New tags added: ${newTagsCount}`)
    console.log(`  Weekly update count: ${updatedData.metadata.weeklyUpdateCount}`)
    console.log(`  Last source: ${updatedData.metadata.lastAccumulationSource}`)
    
    // サンプルタグ表示（最初の10個と最後の10個）
    if (cleanedTags.length > 20) {
      console.log('\n🏷️  Sample tags (first 10):')
      console.log(`  ${cleanedTags.slice(0, 10).join(', ')}`)
      console.log('\n🏷️  Sample tags (last 10):')
      console.log(`  ${cleanedTags.slice(-10).join(', ')}`)
    } else {
      console.log('\n🏷️  All tags:')
      console.log(`  ${cleanedTags.join(', ')}`)
    }

    console.log('\n✅ Tag accumulation completed successfully!')

  } catch (error) {
    console.error('❌ Tag accumulation failed:', error)
    process.exit(1)
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith('tsx')) {
  main()
}

export { main as accumulateTags, extractTagsFromPartialResults, extractTagsFromKV }