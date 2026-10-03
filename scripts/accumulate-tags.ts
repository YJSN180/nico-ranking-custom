#!/usr/bin/env npx tsx
/**
 * タグ累積・保存スクリプト
 * ランキングデータからすべてのタグを抽出し、R2に累積的に保存
 * オートコンプリート機能で使用
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { KVRankingData } from '../types/ranking'
import { decodeHtmlEntities } from '../lib/html-entities'
import {
  TAG_POPULARITY_MAX_LEVEL,
  TAG_POPULARITY_VERSION,
  decodeTagPopularity,
  encodeTagPopularity,
} from '../workers/utils/tag-suggest'
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

// 人気度: 実行ごとに「そのタグが付いた動画の数」（ジャンル・期間・タグ別ランキングをまたいで同じ動画は 1 本）を数え、
// 前回の保存からの経過時間で前回の値を減らして混ぜる（半減期 24 時間）。実行が遅れても重なっても、時間あたりの重みは変わらない
export const POPULARITY_HALF_LIFE_HOURS = 24
const POPULARITY_HALF_LIFE_MS = POPULARITY_HALF_LIFE_HOURS * 3_600_000
// 保存する段は log2 を 1/1024 刻みにした整数（0 は人気度なし）。丸めの誤差は半段（約 0.034%）
export const POPULARITY_STEPS_PER_DOUBLING = 1024
// 1 段目が表す人気度の log2。2^-26（約 1.5e-8）から 2^19.6（約 77 万本）までを表す
export const POPULARITY_BASE_LOG2 = -26

// 最後に見た日。Worker は読まないので、解析の負担が小さい 1 本の文字列にする
export interface TagLastSeen {
  day: number  // 基準日（UTC のエポック日数）
  ages: string  // i 文字目が tags[i] を最後に見た日が基準日の何日前か（36 進 1 文字）
}

// 人気度。scores の 3 文字ずつが tags と同じ並びの段（36 進）で、段 q > 0 の人気度は 2^(base + (q - 1) / 1024)。
// 時間による減り方は base に寄せ、見ていないタグの段は丸め直さない（段は整数だけずらす）
export interface TagPopularity {
  base: number
  scores: string
}

// R2に保存するタグデータの構造
export interface TagAccumulationData {
  tags: string[]  // 累積されたタグリスト（重複なし、50音順）
  lastSeen: TagLastSeen
  popularity: TagPopularity
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount: number  // 週次更新回数
    retentionDays: number
    maxTags: number
    namesDecoded: boolean  // タグ名の文字参照（&amp; など）を戻し済み。次回からは既存の名前を戻さない
    popularityVersion: number  // 人気度の形式。Worker はこの値が分かるときだけ人気度で並べる
  }
}

// 段の並び（tags と同じ並び）と、1 段目が表す人気度の log2
export interface TagPopularityLevels {
  base: number
  levels: ArrayLike<number>
}

// R2 から読んだ既存データ。lastSeenDays は tags と同じ並びの最後に見た日で、ない（旧形式）こともある
// namesDecoded がないデータは、getthumbinfo の名前を XML のまま（&amp; など）持っていることがある
// popularity がないデータ（旧形式・形が合わない）は、すべてのタグの人気度を 0 として扱う
export interface ExistingTagAccumulation {
  tags: string[]
  lastSeenDays?: number[]
  namesDecoded?: boolean
  popularity?: TagPopularityLevels
  metadata: { version: number; weeklyUpdateCount: number; lastUpdated?: string }
}

export interface TagRetentionOptions {
  retentionDays?: number
  maxTags?: number
}

export interface TagMergeOptions extends TagRetentionOptions {
  // 今回の実行で、タグごとにそのタグが付いていた動画の数（countTagVideos の結果）
  videoCounts?: ReadonlyMap<string, number>
  // 前回の保存からの経過時間。分からなければ null で、前回の人気度は使わず今回の数だけにする
  elapsedMs?: number | null
}

export interface TagMergeStats {
  seen: number  // 今回見つかった有効なタグ（重複なし）
  added: number  // 既存になかったタグ
  decoded: number  // 文字参照を戻して名前が変わった既存タグ
  expired: number  // 保持期間切れで落としたタグ
  capped: number  // 上限超過で落としたタグ
  legacy: boolean  // 既存に揃った lastSeenDays がなかった
  oldestAgeDays: number  // 残したタグのうち最も前に見たものが何日前か（実際に残っている期間の目安）
  popularityCarried: boolean  // 前回の人気度を引き継いだ（なければ 0 から数えた）
  scored: number  // 残したタグのうち人気度が 0 でないもの
}

export interface MergedTagAccumulation {
  tags: string[]
  lastSeenDays: number[]
  popularity: { base: number; levels: number[] }
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

// 人気度を段にする。表せないほど小さければ 0、大きすぎれば最大の段
export function popularityToLevel(score: number, base: number): number {
  if (!(score > 0)) return 0
  const level = Math.round((Math.log2(score) - base) * POPULARITY_STEPS_PER_DOUBLING) + 1
  return level < 1 ? 0 : Math.min(level, TAG_POPULARITY_MAX_LEVEL)
}

export function levelToPopularity(level: number, base: number): number {
  return level > 0 ? 2 ** (base + (level - 1) / POPULARITY_STEPS_PER_DOUBLING) : 0
}

// 段の並びを保存する形にする。範囲外の段は書かずに throw する
export function encodePopularity(popularity: TagPopularityLevels): TagPopularity {
  return { base: popularity.base, scores: encodeTagPopularity(popularity.levels) }
}

// 保存した形から tags と同じ並びの段に戻す。形式・長さ・base が合わなければ null（人気度 0 として扱う）
export function decodePopularity(tags: readonly unknown[], value: unknown, version: unknown): TagPopularityLevels | null {
  if (version !== TAG_POPULARITY_VERSION || !isRecord(value)) return null
  const { base, scores } = value
  // base は保存のたびに POPULARITY_BASE_LOG2 の半段以内へ戻すので、大きく離れていれば壊れたデータとみなす
  if (typeof base !== 'number' || !Number.isFinite(base) || Math.abs(base - POPULARITY_BASE_LOG2) > 1) return null
  const levels = decodeTagPopularity(scores, tags.length)
  return levels ? { base, levels } : null
}

// tags と同じ長さで、すべて範囲内の整数の段か
function hasAlignedPopularity(tags: readonly unknown[], popularity: TagPopularityLevels | undefined): popularity is TagPopularityLevels {
  if (!popularity || !isFiniteNumber(popularity.base)) return false
  const { levels } = popularity
  if (!levels || levels.length !== tags.length) return false
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    if (!Number.isInteger(level) || level < 0 || level > TAG_POPULARITY_MAX_LEVEL) return false
  }
  return true
}

// 前回の人気度に掛ける重みの log2（elapsedMs 経って 2^(-elapsed/半減期)）。経過が分からなければ -Infinity（前回を使わない）
function popularityDecayLog2(elapsedMs: number | null | undefined): number {
  if (typeof elapsedMs !== 'number' || Number.isNaN(elapsedMs)) return -Infinity
  // 時計のずれで前回が未来に見えるときは、経過 0 とする
  return -Math.max(0, elapsedMs) / POPULARITY_HALF_LIFE_MS
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
    if (typeof metadata.lastUpdated === 'string') result.metadata.lastUpdated = metadata.lastUpdated
    if (metadata.namesDecoded === true) result.namesDecoded = true
    const popularityValue = isRecord(value) ? value.popularity : undefined
    const popularity = decodePopularity(tags, popularityValue, metadata.popularityVersion)
    if (popularity) {
      result.popularity = popularity
    } else if (tags.length > 0 && (popularityValue !== undefined || metadata.popularityVersion !== undefined)) {
      // 人気度のない旧形式は黙って 0 から数える。読めない人気度だけを知らせる（タグの中身はログに出さない）
      console.warn('⚠️ Existing tag accumulation has unreadable popularity; counting popularity from zero')
    }
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
 *
 * 人気度は、前回の値に 2^(-経過時間/半減期) を掛け、今回の動画数を残りの重みで足す（時間で平均した動画数になり、
 * 実行が遅れても重なっても時間あたりの重みは変わらない）。減らす分は base に寄せて段を整数だけずらすので、
 * 今回の動画数がないタグの段は丸め直さず、何回保存しても誤差が増えない。動画数を足したタグだけ丸め直し
 * （1 回で半段、約 0.034%）、それまでの誤差は前回の値と一緒に減っていく（毎時の保存を 30 日続けても 1% 程度）。
 * 人気度は辞書に残すタグにだけ付け、どのタグを残すか（保持期間・上限）には使わない。
 */
export function mergeTagAccumulation(
  existing: {
    tags: readonly string[]
    lastSeenDays?: readonly number[]
    namesDecoded?: boolean
    popularity?: TagPopularityLevels
  },
  seenNow: Iterable<string>,
  todayDay: number,
  options: TagMergeOptions = {},
): MergedTagAccumulation {
  const retentionDays = options.retentionDays ?? TAG_RETENTION_DAYS
  const maxTags = options.maxTags ?? MAX_ACCUMULATED_TAGS
  const knownDays = hasAlignedLastSeenDays(existing.tags, existing.lastSeenDays) ? existing.lastSeenDays : null
  const legacySpread = Math.max(1, retentionDays - 1)

  // 前回の人気度を減らした分を base に寄せ、base が POPULARITY_BASE_LOG2 の半段以内に戻るよう段を整数だけずらす
  const decayLog2 = popularityDecayLog2(options.elapsedMs)
  const previous = decayLog2 > -Infinity && hasAlignedPopularity(existing.tags, existing.popularity)
    ? existing.popularity
    : null
  let base = POPULARITY_BASE_LOG2
  let shift = 0
  if (previous) {
    const decayedBase = previous.base + decayLog2
    shift = Math.round((POPULARITY_BASE_LOG2 - decayedBase) * POPULARITY_STEPS_PER_DOUBLING)
    base = decayedBase + shift / POPULARITY_STEPS_PER_DOUBLING
  }
  const previousLevel = (i: number): number => {
    if (!previous) return 0
    const level = previous.levels[i]
    if (level === 0) return 0
    const shifted = level - shift
    return shifted < 1 ? 0 : Math.min(shifted, TAG_POPULARITY_MAX_LEVEL)
  }

  // タグごとの置き場所。既存の並び（50音順）のまま足していくので、最後の並べ替えが速く済む
  const slotOf = new Map<string, number>()
  const names: string[] = []
  const slotDays: number[] = []
  const slotLevels: number[] = []
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
    const level = previousLevel(i)
    const slot = slotOf.get(tag)
    if (slot === undefined) {
      slotOf.set(tag, names.length)
      names.push(tag)
      slotDays.push(day)
      slotLevels.push(level)
    } else {
      // 同じ名前になったタグは、新しく見た日と高い方の人気度を残す
      if (day > slotDays[slot]) slotDays[slot] = day
      if (level > slotLevels[slot]) slotLevels[slot] = level
    }
  }

  const seen = new Set<string>()
  for (const raw of seenNow) {
    const tag = normalizeTag(raw)
    if (tag !== null) seen.add(tag)
  }
  let added = 0
  for (const tag of seen) {
    const slot = slotOf.get(tag)
    if (slot === undefined) {
      added++
      slotOf.set(tag, names.length)
      names.push(tag)
      slotDays.push(todayDay)
      slotLevels.push(0)
    } else {
      slotDays[slot] = todayDay
    }
  }

  // 今回の動画数を足す。前回から時間が経つほど今回の重みが大きい（前回が分からなければ今回の数そのもの）
  const weight = 1 - 2 ** decayLog2
  if (weight > 0 && options.videoCounts) {
    for (const [raw, count] of options.videoCounts) {
      const tag = normalizeTag(raw)
      const slot = tag === null ? undefined : slotOf.get(tag)
      if (slot === undefined || !(count > 0) || !Number.isFinite(count)) continue
      slotLevels[slot] = popularityToLevel(levelToPopularity(slotLevels[slot], base) + count * weight, base)
    }
  }

  // 今日を含む retentionDays 日より前に見たタグを落とす
  const oldestDay = todayDay - (retentionDays - 1)
  let tags: string[] = []
  let days: number[] = []
  let levels: number[] = []
  for (let slot = 0; slot < names.length; slot++) {
    if (slotDays[slot] >= oldestDay) {
      tags.push(names[slot])
      days.push(slotDays[slot])
      levels.push(slotLevels[slot])
    }
  }
  const expired = names.length - tags.length

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
    levels = levels.filter((_, i) => keep[i] === 1)
  }

  let oldestKept = todayDay
  for (const day of days) if (day < oldestKept) oldestKept = day
  let scored = 0
  for (const level of levels) if (level > 0) scored++

  // 50音順に並べ、lastSeenDays と人気度も同じ並びにする
  const order = tags.map((_, i) => i)
  order.sort((a, b) => japaneseCollator.compare(tags[a], tags[b]))
  return {
    tags: order.map(i => tags[i]),
    lastSeenDays: order.map(i => days[i]),
    popularity: { base, levels: order.map(i => levels[i]) },
    stats: {
      seen: seen.size,
      added,
      decoded,
      expired,
      capped,
      legacy: knownDays === null && existing.tags.length > 0,
      oldestAgeDays: todayDay - oldestKept,
      popularityCarried: previous !== null,
      scored,
    },
  }
}

/**
 * 保存するデータを作る。失敗が疑われる結果なら throw して、R2 の前回分を残す。
 * videoCounts は今回の実行でタグごとにそのタグが付いていた動画の数（countTagVideos の結果）
 */
export function buildTagAccumulation(
  existing: ExistingTagAccumulation,
  seenNow: Iterable<string>,
  now: Date,
  source: string,
  videoCounts?: ReadonlyMap<string, number>,
): { data: TagAccumulationData; stats: TagMergeStats } {
  const todayDay = toEpochDay(now)
  // 人気度を減らす経過時間は、前回の保存時刻から測る（実行の回数ではなく時間で減らす）
  const previousUpdate = existing.metadata.lastUpdated === undefined ? Number.NaN : Date.parse(existing.metadata.lastUpdated)
  const merged = mergeTagAccumulation(existing, seenNow, todayDay, {
    videoCounts,
    elapsedMs: Number.isNaN(previousUpdate) ? null : now.getTime() - previousUpdate,
  })
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
      popularity: encodePopularity(merged.popularity),
      metadata: {
        version: existing.metadata.version + 1,
        lastUpdated: now.toISOString(),
        totalUniqueTags: merged.tags.length,
        lastAccumulationSource: source,
        weeklyUpdateCount: existing.metadata.weeklyUpdateCount + 1,
        retentionDays: TAG_RETENTION_DAYS,
        maxTags: MAX_ACCUMULATED_TAGS,
        namesDecoded: true,
        popularityVersion: TAG_POPULARITY_VERSION,
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
  videoCounts?: ReadonlyMap<string, number>,
): Promise<{ data: TagAccumulationData; stats: TagMergeStats }> {
  const result = buildTagAccumulation(existing, seenNow, now, source, videoCounts)
  await fs.writeFile(outputPath, serializeTagAccumulation(result.data))
  return result
}

function assertR2Credentials(): void {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('R2 credentials not configured')
  }
}

// 1 回の実行で集めたもの。seen は辞書へ入れるタグ、videoTags は人気度を数えるための動画 ID ごとのタグ
export interface RunTags {
  seen: Set<string>
  videoTags: Map<string, Set<string>>
}

export function createRunTags(): RunTags {
  return { seen: new Set(), videoTags: new Map() }
}

// 動画の一覧から、動画ごとのタグ（tags と tagDetails の名前）を集める。toSeen なら辞書へ入れるタグにもする
function addItemTags(run: RunTags, items: unknown, toSeen: boolean): void {
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (!isRecord(item)) continue
    const names: string[] = []
    if (Array.isArray(item.tags)) {
      for (const tag of item.tags) if (typeof tag === 'string') names.push(tag)
    }
    if (Array.isArray(item.tagDetails)) {
      for (const detail of item.tagDetails) if (isRecord(detail) && typeof detail.name === 'string') names.push(detail.name)
    }
    if (toSeen) for (const name of names) run.seen.add(name)
    // ID のない動画は、ほかの一覧の同じ動画とまとめられないので数えない
    if (typeof item.id !== 'string' || item.id === '' || names.length === 0) continue
    let tags = run.videoTags.get(item.id)
    if (!tags) {
      tags = new Set()
      run.videoTags.set(item.id, tags)
    }
    for (const name of names) tags.add(name)
  }
}

/**
 * 1 つのジャンル・期間のデータ（items・popularTags・タグ別ランキング）から集める。
 * タグ別ランキングの動画は人気度に数えるだけで、その動画のタグを辞書へは足さない（辞書に入るタグは今までどおり）
 */
export function addPeriodTags(run: RunTags, periodData: unknown): void {
  if (!isRecord(periodData)) return
  addItemTags(run, periodData.items, true)
  if (Array.isArray(periodData.popularTags)) {
    for (const tag of periodData.popularTags) if (typeof tag === 'string') run.seen.add(tag)
  }
  if (isRecord(periodData.tags)) {
    for (const [tag, list] of Object.entries(periodData.tags)) {
      run.seen.add(tag)
      addItemTags(run, list, false)
    }
  }
}

/** タグごとに、そのタグが付いていた動画の数を数える（同じ動画は、ジャンル・期間・一覧をまたいで 1 本） */
export function countTagVideos(videoTags: ReadonlyMap<string, ReadonlySet<string>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const names of videoTags.values()) {
    // トリムして同じになる名前は、1 本の動画で 1 回だけ数える
    const tags = new Set<string>()
    for (const name of names) {
      const tag = normalizeTag(name)
      if (tag !== null) tags.add(tag)
    }
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

// KVランキングデータからタグを抽出
function extractTagsFromKVData(kvData: KVRankingData, run: RunTags): void {
  for (const genreData of Object.values(kvData.genres)) {
    // 24時間・1時間ランキングのアイテム・人気タグ・タグランキング（重複は自動的に除外される）
    addPeriodTags(run, genreData['24h'])
    addPeriodTags(run, genreData['hour'])
  }
}

// 部分的結果ファイルからタグを抽出（GitHub Actions実行中用）
async function extractTagsFromPartialResults(): Promise<RunTags> {
  const run = createRunTags()
  const tmpDir = './tmp'

  try {
    // 最初に集約済みデータファイルの存在を確認
    const aggregatedDataPath = path.join(tmpDir, 'latest-aggregated-data.json')
    try {
      await fs.access(aggregatedDataPath)
      console.log(`📊 Found aggregated data file, using it for tag extraction`)

      const aggregatedData: unknown = JSON.parse(await fs.readFile(aggregatedDataPath, 'utf-8'))
      const genres = isRecord(aggregatedData) && isRecord(aggregatedData.genres) ? aggregatedData.genres : {}

      // 全ジャンル・期間のデータからタグを抽出
      for (const genreData of Object.values(genres)) {
        if (!isRecord(genreData)) continue
        for (const periodData of Object.values(genreData)) addPeriodTags(run, periodData)
      }

      console.log(`✅ Extracted ${run.seen.size} unique tags from aggregated data`)
      return run
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
        const parsed: unknown = JSON.parse(content)
        const results = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.results : undefined
        if (!Array.isArray(results)) continue

        for (const result of results) {
          if (!isRecord(result) || !isRecord(result.data)) continue
          // 24時間・1時間ランキング
          addPeriodTags(run, result.data['24h'])
          addPeriodTags(run, result.data['hour'])
        }
      } catch (error) {
        console.error(`Error parsing ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Error reading tmp directory:', error)
  }

  return run
}

// KVから既存データを読み込み（フォールバック用）
async function extractTagsFromKV(): Promise<RunTags> {
  const run = createRunTags()

  try {
    // KVからランキングデータを読み込み
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      console.log('KV credentials not found, skipping KV extraction')
      return run
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
          const before = run.seen.size
          extractTagsFromKVData(kvData, run)
          console.log(`📊 Extracted ${run.seen.size - before} new tags from KV group ${groupId}`)
        }
      } catch (error) {
        console.log(`Error reading KV group ${groupId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error extracting tags from KV:', error)
  }

  return run
}

// メイン処理
async function main() {
  try {
    console.log('🏷️  Starting tag accumulation process...')

    // 1. 既存のタグデータを読み込み
    const existingData = await getExistingTagsFromR2()
    console.log(`📋 Existing tags: ${existingData.tags.length}`)

    // 2. 新しいタグと、タグごとの動画数を抽出（複数ソースから）
    // 2a. GitHub Actions実行中の場合：部分的結果から抽出
    console.log('🔍 Extracting tags from partial results...')
    let run = await extractTagsFromPartialResults()
    const partialTagCount = run.seen.size
    console.log(`📂 Found ${partialTagCount} tags from partial results`)

    // 2b. フォールバック：KVから直接抽出
    if (partialTagCount === 0) {
      console.log('🔄 No partial results, extracting from KV...')
      run = await extractTagsFromKV()
      console.log(`📊 Found ${run.seen.size} tags from KV`)
    }
    const videoCounts = countTagVideos(run.videoTags)
    console.log(`📈 Counted ${videoCounts.size} tags over ${run.videoTags.size} distinct videos`)

    // 3. 既存タグとマージし（保持期間・上限を適用し、50音順に並べる）、R2 へ上げるファイルに書く
    assertR2Credentials()
    const outputPath = path.join(process.cwd(), 'tmp', 'tag-accumulation.json')
    const { data: updatedData, stats } = await writeTagAccumulationFile(
      existingData,
      run.seen,
      new Date(),
      partialTagCount > 0 ? 'partial-results' : 'kv-fallback',
      outputPath,
      videoCounts,
    )
    const cleanedTags = updatedData.tags
    console.log(`✨ Found ${stats.added} new unique tags`)
    if (stats.legacy) console.log('🕰️  Existing data had no lastSeen; spread legacy tags over the retention window')
    if (stats.decoded > 0) console.log(`🔤 Decoded HTML entities in ${stats.decoded} existing tag names`)
    console.log(`🧹 Expired ${stats.expired}, capped ${stats.capped}, kept ${cleanedTags.length} tags (oldest last seen ${stats.oldestAgeDays} days ago)`)
    console.log(`🔥 ${stats.scored} kept tags have a popularity score (${stats.popularityCarried ? 'carried over from the previous save' : 'counted from zero'})`)
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
