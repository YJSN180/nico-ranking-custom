// リクエスト時（検索応答・SSR）にその場で掛ける軽量ルール
// ポーリングの隙間（最大 15 分）を埋めるため、外部 I/O なしで判定できるものだけを適用する:
//   - B: タイトル照合語の部分列一致（全項目）
//   - D: ロックタグ群（tagDetails を持つ項目だけ。ランキングは全件、検索は補完後のみ）
// C（投稿頻度）はページ内だけでは投稿者の全体像が分からず、単独では NG にしない方針のため掛けない。
import type { RankingItem } from '../../types/ranking'
import { matchesAnySubsequenceNeedle } from './normalize'
import { countLockedGroups } from './rules'
import type { LqngConfig, LqngRuleId } from './types'

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
  const allowAuthors = new Set(config.allowlist.authorIds)
  const allowVideos = new Set(config.allowlist.videoIds)
  const excluded: Record<string, LqngRuleId[]> = {}
  const kept = items.filter((item) => {
    if (allowVideos.has(item.id) || (item.authorId && allowAuthors.has(item.authorId))) return true
    const reasons: LqngRuleId[] = []
    if (config.titleNeedles.length > 0 && matchesAnySubsequenceNeedle(item.title, config.titleNeedles)) reasons.push('B')
    if (config.tagGroups.length > 0 && item.tagDetails && countLockedGroups(item.tagDetails, config.tagGroups) >= config.lockGroupsMin) reasons.push('D')
    if (reasons.length === 0) return true
    excluded[item.id] = reasons
    return false
  })
  return { items: kept, excludedCount: items.length - kept.length, excluded }
}
