#!/usr/bin/env npx tsx
/**
 * タグ累積・保存スクリプト
 * ランキングデータからすべてのタグを抽出し、R2に累積的に保存
 * オートコンプリート機能で使用
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { KVRankingData, RankingItem, TagDetail } from '../types/ranking'
import { decodeHtmlEntities } from '../lib/html-entities'
import { createR2Store } from './lib/r2-store'

// 直近30日に見たタグだけを、最大30万件まで残す
// （新しいタグは日に 3.5〜4 万件増えるため、普段は上限が先に効き、残るのは直近 1 週間ほどに見たタグになる）
export const TAG_RETENTION_DAYS = 30
export const MAX_ACCUMULATED_TAGS = 300_000
// 既存がこの件数以上あるのに結果がこれを下回るときは保存しない
const MIN_SAFE_TAG_COUNT = 10_000
const MAX_TAG_LENGTH = 100
const DAY_MS = 86_400_000
// localeCompare(b, 'ja', 同じ options) と同じ順序。毎回 Collator を作らないので速い
const japaneseCollator = new Intl.Collator('ja', { numeric: true, caseFirst: 'lower' })
// 最後に見た日を「基準日の何日前か」の 36 進 1 文字で持つ（0〜35 日。保持期間は 30 日）
const AGE_RADIX = 36
const AGE_CHARS = /^[0-9a-z]*$/

// 最後に見た日。Worker は読まないので、解析の負担が小さい 1 本の文字列にする
export interface TagLastSeen {
  day: number  // 基準日（UTC のエポック日数）
  ages: string  // i 文字目が tags[i] を最後に見た日が基準日の何日前か（36 進 1 文字）
}

// R2に保存するタグデータの構造
export interface TagAccumulationData {
  tags: string[]  // 累積されたタグリスト（重複なし、50音順）
  lastSeen: TagLastSeen
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount: number  // 週次更新回数
    retentionDays: number
    maxTags: number
    namesDecoded: boolean  // タグ名の文字参照（&amp; など）を戻し済み。次回からは既存の名前を戻さない
  }
}

// R2 から読んだ既存データ。lastSeenDays は tags と同じ並びの最後に見た日で、ない（旧形式）こともある
// namesDecoded がないデータは、getthumbinfo の名前を XML のまま（&amp; など）持っていることがある
export interface ExistingTagAccumulation {
  tags: string[]
  lastSeenDays?: number[]
  namesDecoded?: boolean
  metadata: { version: number; weeklyUpdateCount: number }
}

export interface TagRetentionOptions {
  retentionDays?: number
  maxTags?: number
}

export interface TagMergeStats {
  seen: number  // 今回見つかった有効なタグ（重複なし）
  added: number  // 既存になかったタグ
  decoded: number  // 文字参照を戻して名前が変わった既存タグ
  expired: number  // 保持期間切れで落としたタグ
  capped: number  // 上限超過で落としたタグ
  legacy: boolean  // 既存に揃った lastSeenDays がなかった
  oldestAgeDays: number  // 残したタグのうち最も前に見たものが何日前か（実際に残っている期間の目安）
}

export interface MergedTagAccumulation {
  tags: string[]
  lastSeenDays: number[]
  stats: TagMergeStats
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// tags と同じ長さで、すべて整数の日付か
function hasAlignedLastSeenDays(tags: readonly unknown[], days: unknown): days is readonly number[] {
  return Array.isArray(days) && days.length === tags.length && days.every((day: unknown) => Number.isSafeInteger(day))
}

// 最後に見た日を保存する形にする。範囲外の日付は書かずに throw する
export function encodeLastSeen(lastSeenDays: readonly number[], day: number): TagLastSeen {
  let ages = ''
  for (const seenDay of lastSeenDays) {
    const age = day - seenDay
    if (!Number.isSafeInteger(age) || age < 0 || age >= AGE_RADIX) {
      throw new Error(`Cannot encode a last-seen age of ${age} days`)
    }
    ages += age.toString(AGE_RADIX)
  }
  return { day, ages }
}

// 保存した形から tags と同じ並びの日付に戻す。揃っていなければ null（旧形式として扱う）
export function decodeLastSeen(tags: readonly unknown[], value: unknown): number[] | null {
  if (!isRecord(value)) return null
  const { day, ages } = value
  if (typeof day !== 'number' || !Number.isSafeInteger(day) || typeof ages !== 'string') return null
  if (ages.length !== tags.length || !AGE_CHARS.test(ages)) return null
  const days = new Array<number>(ages.length)
  for (let i = 0; i < ages.length; i++) days[i] = day - Number.parseInt(ages[i], AGE_RADIX)
  return days
}

// Cloudflare R2からタグデータを取得
export async function getExistingTagsFromR2(): Promise<ExistingTagAccumulation> {
  const existing = await createR2Store().read('tag-accumulation.json')
  if (existing) {
    const value: unknown = existing.data
    const tags = isRecord(value) ? value.tags : undefined
    const metadata = isRecord(value) && isRecord(value.metadata) ? value.metadata : {}
    if (!Array.isArray(tags) || tags.some((tag: unknown) => typeof tag !== 'string') ||
        !isFiniteNumber(metadata.version) || !isFiniteNumber(metadata.weeklyUpdateCount)) {
      throw new Error('Invalid existing tag accumulation; retaining last-known-good object')
    }
    const lastSeen = isRecord(value) ? value.lastSeen : undefined
    const lastSeenDays = decodeLastSeen(tags, lastSeen)
    const result: ExistingTagAccumulation = {
      tags,
      metadata: { version: metadata.version, weeklyUpdateCount: metadata.weeklyUpdateCount },
    }
    if (metadata.namesDecoded === true) result.namesDecoded = true
    if (lastSeenDays) {
      result.lastSeenDays = lastSeenDays
    } else if (tags.length > 0) {
      // タグの中身はログに出さない
      console.warn(lastSeen === undefined
        ? '⚠️ Existing tag accumulation has no lastSeen; treating it as legacy'
        : '⚠️ Existing tag accumulation has misaligned lastSeen; treating it as legacy')
    }
    return result
  }
  // Only a confirmed missing object may initialize a new cumulative list.
  return { tags: [], metadata: { version: 1, weeklyUpdateCount: 1 } }
}

// UTC のエポック日数
export function toEpochDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS)
}

// FNV-1a（32bit、UTF-16 コード単位）。実行環境によらず同じ値になる
export function tagHash(tag: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < tag.length; i++) {
    hash ^= tag.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// トリムし、空や長すぎるタグは捨てる
function normalizeTag(tag: unknown): string | null {
  if (typeof tag !== 'string') return null
  const trimmed = tag.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_TAG_LENGTH ? trimmed : null
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 既存タグと今回見たタグをまとめる。
 * 今回見たタグは今日の日付にし、保持期間を過ぎたタグを落とし、上限を超えたら新しく見たものを残す。
 * 旧形式（lastSeenDays なし）の既存タグには、ハッシュで昨日〜29日前に散らした日付を仮に付ける
 * （一度に消えず、特定の文字の範囲だけが消えることもない）。
 * namesDecoded でない既存タグは文字参照を 1 回だけ戻し、同じ名前になったものは新しく見た日を残す。
 * 戻し済みの名前（今回見たタグも）をもう一度戻すと、&amp; を名前に含む実在のタグが変わるので戻さない。
 */
export function mergeTagAccumulation(
  existing: { tags: readonly string[]; lastSeenDays?: readonly number[]; namesDecoded?: boolean },
  seenNow: Iterable<string>,
  todayDay: number,
  options: TagRetentionOptions = {},
): MergedTagAccumulation {
  const retentionDays = options.retentionDays ?? TAG_RETENTION_DAYS
  const maxTags = options.maxTags ?? MAX_ACCUMULATED_TAGS
  const knownDays = hasAlignedLastSeenDays(existing.tags, existing.lastSeenDays) ? existing.lastSeenDays : null
  const legacySpread = Math.max(1, retentionDays - 1)

  // Map の挿入順は既存の並び（50音順）を保つので、最後の並べ替えが速く済む
  const lastSeen = new Map<string, number>()
  let decoded = 0
  for (let i = 0; i < existing.tags.length; i++) {
    const stored = existing.tags[i]
    const name = existing.namesDecoded === true || typeof stored !== 'string' ? stored : decodeHtmlEntities(stored)
    if (name !== stored) decoded++
    const tag = normalizeTag(name)
    if (tag === null) continue
    const day = knownDays
      ? Math.min(knownDays[i], todayDay)
      : todayDay - 1 - (tagHash(tag) % legacySpread)
    const previous = lastSeen.get(tag)
    if (previous === undefined || day > previous) lastSeen.set(tag, day)
  }

  const seen = new Set<string>()
  for (const raw of seenNow) {
    const tag = normalizeTag(raw)
    if (tag !== null) seen.add(tag)
  }
  let added = 0
  for (const tag of seen) {
    if (!lastSeen.has(tag)) added++
    lastSeen.set(tag, todayDay)
  }

  // 今日を含む retentionDays 日より前に見たタグを落とす
  const oldestDay = todayDay - (retentionDays - 1)
  let tags: string[] = []
  let days: number[] = []
  for (const [tag, day] of lastSeen) {
    if (day >= oldestDay) {
      tags.push(tag)
      days.push(day)
    }
  }
  const expired = lastSeen.size - tags.length

  // 上限を超えたら新しく見た順に残す。同じ日はハッシュ順（実行ごとに変わらない）
  let capped = 0
  if (tags.length > maxTags) {
    const hashes = tags.map(tagHash)
    const ranked = tags.map((_, i) => i)
    ranked.sort((a, b) => days[b] - days[a] || hashes[a] - hashes[b] || compareCodeUnits(tags[a], tags[b]))
    const keep = new Uint8Array(tags.length)
    for (let r = 0; r < maxTags; r++) keep[ranked[r]] = 1
    capped = tags.length - maxTags
    tags = tags.filter((_, i) => keep[i] === 1)
    days = days.filter((_, i) => keep[i] === 1)
  }

  let oldestKept = todayDay
  for (const day of days) if (day < oldestKept) oldestKept = day

  // 50音順に並べ、lastSeenDays も同じ並びにする
  const order = tags.map((_, i) => i)
  order.sort((a, b) => japaneseCollator.compare(tags[a], tags[b]))
  return {
    tags: order.map(i => tags[i]),
    lastSeenDays: order.map(i => days[i]),
    stats: {
      seen: seen.size,
      added,
      decoded,
      expired,
      capped,
      legacy: knownDays === null && existing.tags.length > 0,
      oldestAgeDays: todayDay - oldestKept,
    },
  }
}

/** 保存するデータを作る。失敗が疑われる結果なら throw して、R2 の前回分を残す */
export function buildTagAccumulation(
  existing: ExistingTagAccumulation,
  seenNow: Iterable<string>,
  now: Date,
  source: string,
): { data: TagAccumulationData; stats: TagMergeStats } {
  const todayDay = toEpochDay(now)
  const merged = mergeTagAccumulation(existing, seenNow, todayDay)
  if (merged.stats.seen === 0) {
    throw new Error('Refusing to save tag accumulation: this run extracted no tags')
  }
  if (existing.tags.length >= MIN_SAFE_TAG_COUNT && merged.tags.length < MIN_SAFE_TAG_COUNT) {
    throw new Error(`Refusing to save tag accumulation: ${merged.tags.length} tags would replace ${existing.tags.length}`)
  }
  return {
    data: {
      tags: merged.tags,
      lastSeen: encodeLastSeen(merged.lastSeenDays, todayDay),
      metadata: {
        version: existing.metadata.version + 1,
        lastUpdated: now.toISOString(),
        totalUniqueTags: merged.tags.length,
        lastAccumulationSource: source,
        weeklyUpdateCount: existing.metadata.weeklyUpdateCount + 1,
        retentionDays: TAG_RETENTION_DAYS,
        maxTags: MAX_ACCUMULATED_TAGS,
        namesDecoded: true,
      },
    },
    stats: merged.stats,
  }
}

// Worker が解析する文字列を小さくするため整形しない
export function serializeTagAccumulation(tagData: TagAccumulationData): string {
  return JSON.stringify(tagData)
}

/**
 * 既存と今回のタグをまとめ、R2 へ上げるファイルに整形なしで書く（アップロードは write-to-r2.ts）。
 * 保存しない判定なら throw し、ファイルは作らない
 */
export async function writeTagAccumulationFile(
  existing: ExistingTagAccumulation,
  seenNow: Iterable<string>,
  now: Date,
  source: string,
  outputPath: string,
): Promise<{ data: TagAccumulationData; stats: TagMergeStats }> {
  const result = buildTagAccumulation(existing, seenNow, now, source)
  await fs.writeFile(outputPath, serializeTagAccumulation(result.data))
  return result
}

function assertR2Credentials(): void {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('R2 credentials not configured')
  }
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
    // 最初に集約済みデータファイルの存在を確認
    const aggregatedDataPath = path.join(tmpDir, 'latest-aggregated-data.json')
    try {
      await fs.access(aggregatedDataPath)
      console.log(`📊 Found aggregated data file, using it for tag extraction`)
      
      const aggregatedData = JSON.parse(await fs.readFile(aggregatedDataPath, 'utf-8'))
      
      // 全ジャンル・期間のデータからタグを抽出
      for (const [genre, genreData] of Object.entries(aggregatedData.genres || {})) {
        for (const [period, periodData] of Object.entries(genreData as any)) {
          if (!periodData || typeof periodData !== 'object') continue
          
          const data = periodData as any
          
          // アイテムからタグ抽出
          if (data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
              if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach((tag: string) => allTags.add(tag))
              }
              if (item.tagDetails && Array.isArray(item.tagDetails)) {
                item.tagDetails.forEach((detail: TagDetail) => allTags.add(detail.name))
              }
            }
          }
          
          // 人気タグ
          if (data.popularTags && Array.isArray(data.popularTags)) {
            data.popularTags.forEach((tag: string) => allTags.add(tag))
          }
          
          // タグランキング
          if (data.tags && typeof data.tags === 'object') {
            Object.keys(data.tags).forEach(tag => allTags.add(tag))
          }
        }
      }
      
      console.log(`✅ Extracted ${allTags.size} unique tags from aggregated data`)
      return allTags
    } catch (error) {
      console.log(`📂 Aggregated data file not found, falling back to group files`)
    }
    
    // フォールバック: 個別の部分的結果ファイルから読み込み
    const files = await fs.readdir(tmpDir)
    const groupFiles = files.filter(f => f.startsWith('ranking-group-') && f.endsWith('.json'))
    
    console.log(`📂 Found ${groupFiles.length} group result files`)

    for (const file of groupFiles) {
      console.log(`🔍 Processing ${file}...`)
      const content = await fs.readFile(path.join(tmpDir, file), 'utf-8')
      
      try {
        const parsed = JSON.parse(content)
        const results = Array.isArray(parsed) ? parsed : parsed.results
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

// メイン処理
async function main() {
  try {
    console.log('🏷️  Starting tag accumulation process...')

    // 1. 既存のタグデータを読み込み
    const existingData = await getExistingTagsFromR2()
    console.log(`📋 Existing tags: ${existingData.tags.length}`)

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

    // 3. 既存タグとマージし（保持期間・上限を適用し、50音順に並べる）、R2 へ上げるファイルに書く
    assertR2Credentials()
    const outputPath = path.join(process.cwd(), 'tmp', 'tag-accumulation.json')
    const { data: updatedData, stats } = await writeTagAccumulationFile(
      existingData,
      newTags,
      new Date(),
      partialTags.size > 0 ? 'partial-results' : 'kv-fallback',
      outputPath,
    )
    const cleanedTags = updatedData.tags
    console.log(`✨ Found ${stats.added} new unique tags`)
    if (stats.legacy) console.log('🕰️  Existing data had no lastSeen; spread legacy tags over the retention window')
    if (stats.decoded > 0) console.log(`🔤 Decoded HTML entities in ${stats.decoded} existing tag names`)
    console.log(`🧹 Expired ${stats.expired}, capped ${stats.capped}, kept ${cleanedTags.length} tags (oldest last seen ${stats.oldestAgeDays} days ago)`)
    console.log(`💾 Saved tag data to ${outputPath} for R2 upload`)

    // 4. 統計表示
    console.log('\n📊 Tag Accumulation Summary:')
    console.log(`  Total unique tags: ${updatedData.metadata.totalUniqueTags}`)
    console.log(`  New tags added: ${stats.added}`)
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
