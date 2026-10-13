// 設定の影響確認: 下書きの設定が、公開中のランキングの何本に一致するか（管理画面で保存する前に見せる）
// サイトはリクエストのたびに B（照合語）と D（ロックタグ群）をランキングに当てるので、同じ applyRequestRules で数える。
// キーワード（HK）は投稿頻度かロックタグ群と重なったときだけ NG になる（リクエスト時には当てない）ので、
// タイトルに含む本数だけを別に数える。外部 I/O を持たない（クライアントから import しても安全）
import type { RankingItem } from '../../types/ranking'
import { containsAnyNormalized } from './normalize'
import { applyRequestRules } from './request-rules'
import type { LqngConfig } from './types'

/** 規則ごとに返す例の本数 */
export const LQNG_IMPACT_EXAMPLES = 5

export type LqngImpactRule = 'B' | 'D' | 'HK'

export interface LqngImpactExample {
  id: string
  title: string
}

export interface LqngImpactRuleResult {
  rule: LqngImpactRule
  count: number
  examples: LqngImpactExample[]
}

export interface LqngImpact {
  /** 評価した動画の本数（同じ動画は 1 本） */
  evaluated: number
  /** リクエスト時ルール（B・D）で非表示になる本数（両方に当たる動画は 1 本） */
  hidden: number
  /** B・D・HK の順。HK はキーワードを含む本数（単独では非表示にならない） */
  rules: LqngImpactRuleResult[]
}

const IMPACT_RULES: readonly LqngImpactRule[] = ['B', 'D', 'HK']

export function evaluateLqngImpact(items: readonly RankingItem[], config: LqngConfig): LqngImpact {
  const unique = new Map<string, RankingItem>()
  for (const item of items) if (!unique.has(item.id)) unique.set(item.id, item)
  const list = Array.from(unique.values())
  const matched: Record<LqngImpactRule, RankingItem[]> = { B: [], D: [], HK: [] }
  const { excluded } = applyRequestRules(list, config)
  for (const item of list) {
    for (const rule of excluded[item.id] ?? []) if (rule === 'B' || rule === 'D') matched[rule].push(item)
  }
  if (config.enabled && config.keywordNeedles.length > 0) {
    const allowVideos = new Set(config.allowlist.videoIds)
    const allowAuthors = new Set(config.allowlist.authorIds)
    for (const item of list) {
      if (allowVideos.has(item.id) || (item.authorId !== undefined && allowAuthors.has(item.authorId))) continue
      if (containsAnyNormalized(item.title, config.keywordNeedles)) matched.HK.push(item)
    }
  }
  return {
    evaluated: list.length,
    hidden: Object.keys(excluded).length,
    rules: IMPACT_RULES.map((rule) => ({
      rule,
      count: matched[rule].length,
      examples: matched[rule].slice(0, LQNG_IMPACT_EXAMPLES).map((item) => ({ id: item.id, title: item.title })),
    })),
  }
}

/** ランキングへの影響に関わる項目だけの鍵（同じなら影響も同じ。下書きを確かめ直すかの判定に使う） */
export function lqngImpactKey(config: LqngConfig): string {
  return JSON.stringify([config.enabled, config.titleNeedles, config.keywordNeedles, config.tagGroups, config.lockGroupsMin])
}
