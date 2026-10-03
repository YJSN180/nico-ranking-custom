// リクエスト時（検索応答・SSR）にその場で掛ける軽量ルール
// ポーリングの隙間（最大 15 分）を埋めるため、外部 I/O なしで判定できるものだけを適用する:
//   - B: タイトル照合語の部分列一致（全項目）
//   - D: ロックタグ群（tagDetails を持つ項目だけ。ランキングは全件、検索の新着区間は補完時に lockTagRuleHits で）
// C（投稿頻度）はページ内だけでは投稿者の全体像が分からず、単独では NG にしない方針のため掛けない。
import type { RankingItem, TagDetail } from '../../types/ranking'
import { matchesAnySubsequenceNeedle } from './normalize'
import { countLockedGroups } from './rules'
import type { LqngConfig, LqngRuleId } from './types'

/** 許可リストの動画・投稿者かを返す判定（集合は呼び出しごとに 1 回だけ作る） */
function allowlistPredicate(config: LqngConfig): (video: { id: string; authorId?: string | null }) => boolean {
  const allowVideos = new Set(config.allowlist.videoIds)
  const allowAuthors = new Set(config.allowlist.authorIds)
  return (video) => allowVideos.has(video.id) || (!!video.authorId && allowAuthors.has(video.authorId))
}

const hitsLockTagRule = (tagDetails: readonly TagDetail[], config: LqngConfig): boolean =>
  config.tagGroups.length > 0 && countLockedGroups(tagDetails, config.tagGroups) >= config.lockGroupsMin

/**
 * D（ロックタグ群）だけを当て、該当する動画 ID を返す。検索の新着区間は応答の時点でタグ詳細が無いので、
 * 後からタグを補う /api/search/realtime-tags がこれで判定する（B は /api/search で当て済み）
 */
export function lockTagRuleHits(
  videos: ReadonlyArray<{ id: string; authorId?: string | null; tagDetails: readonly TagDetail[] }>,
  config: LqngConfig | null | undefined
): string[] {
  if (!config || !config.enabled || config.tagGroups.length === 0) return []
  const isAllowlisted = allowlistPredicate(config)
  return videos.filter((video) => !isAllowlisted(video) && hitsLockTagRule(video.tagDetails, config)).map((video) => video.id)
}

export interface RequestRuleResult {
  items: RankingItem[]
  excludedCount: number
  /** 除外した動画 ID → 理由（ログ・デバッグ用） */
  excluded: Record<string, LqngRuleId[]>
}

export function applyRequestRules(items: RankingItem[], config: LqngConfig | null | undefined): RequestRuleResult {
  if (!config || !config.enabled || (config.titleNeedles.length === 0 && config.tagGroups.length === 0)) {
    return { items, excludedCount: 0, excluded: {} }
  }
  const isAllowlisted = allowlistPredicate(config)
  const excluded: Record<string, LqngRuleId[]> = {}
  const kept = items.filter((item) => {
    if (isAllowlisted(item)) return true
    const reasons: LqngRuleId[] = []
    if (config.titleNeedles.length > 0 && matchesAnySubsequenceNeedle(item.title, config.titleNeedles)) reasons.push('B')
    if (item.tagDetails && hitsLockTagRule(item.tagDetails, config)) reasons.push('D')
    if (reasons.length === 0) return true
    excluded[item.id] = reasons
    return false
  })
  return { items: kept, excludedCount: items.length - kept.length, excluded }
}
