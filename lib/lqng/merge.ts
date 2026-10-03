// 判定テーブル（Worker が書く）を、既存の管理者 NG リストへ合流させる
// 優先順位: 手動の管理者 NG → 許可リスト → 自動 NG。
// 許可リストは自動 NG だけを打ち消し、手動 NG には影響しない（手動側は ng-filter-core が先に評価する）。
import type { NGList } from '../../types/ng-list'
import type { AutoNgSets, LqngConfig, LqngVerdicts } from './types'

/** 判定テーブルから、許可リストを除いた自動 NG の集合を取り出す */
export function collectAutoNg(verdicts: LqngVerdicts | null | undefined, config: LqngConfig, now: Date): AutoNgSets {
  if (!verdicts || !config.enabled) return { authorIds: [], videoIds: [] }
  const allowAuthors = new Set(config.allowlist.authorIds)
  const allowVideos = new Set(config.allowlist.videoIds)
  const nowMs = now.getTime()

  const authorIds = Object.entries(verdicts.authors)
    .filter(([id, v]) => v.status === 'ng' && !allowAuthors.has(id))
    .map(([id]) => id)

  const videoIds = Object.entries(verdicts.videos)
    .filter(([id, v]) => {
      if (allowVideos.has(id)) return false
      if (v.authorId && allowAuthors.has(v.authorId)) return false
      if (v.status === 'ng') return true
      if (v.status === 'hold') {
        const until = v.holdUntil ? new Date(v.holdUntil).getTime() : Number.NaN
        return Number.isFinite(until) ? nowMs < until : false
      }
      return false
    })
    .map(([id]) => id)

  return { authorIds, videoIds }
}

/** NGList に自動 NG の欄を足して返す（元の手動リストは変更しない） */
export function mergeAutoNgIntoList(ngList: NGList, auto: AutoNgSets): NGList {
  return {
    ...ngList,
    autoAuthorIds: Array.from(new Set([...(ngList.autoAuthorIds ?? []), ...auto.authorIds])),
    autoVideoIds: Array.from(new Set([...(ngList.autoVideoIds ?? []), ...auto.videoIds])),
  }
}
