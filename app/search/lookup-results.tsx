'use client'

import { CircleAlert, RotateCw } from 'lucide-react'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { TagToggleButton } from '@/components/tag-toggle-button'
import { VIDEO_LOOKUP_MAX_IDS } from '@/lib/search/video-lookup'
import type { NGType } from '@/components/quick-ng-button'
import type { RankingItem } from '@/types/ranking'
import styles from './lookup-results.module.css'

export interface LookupResultData {
  /** 開いた ID（入力順・上限まで） */
  ids: string[]
  /** 上限を超えて開かなかった ID の数 */
  overflow: number
  items: RankingItem[]
  hiddenIds: string[]
  missing: string[]
  unavailable: string[]
  failed: string[]
}

interface LookupResultsProps {
  data: LookupResultData
  /** 利用者の NG を当てた後も残る動画 */
  visibleIds: Set<string>
  onQuickNGAdd: (
    video: RankingItem,
    type: NGType,
    value: string | string[],
  ) => void
  /** 同じ文字をキーワードとして検索し直す（ID のような語を探したいとき） */
  onSearchAsKeyword: () => void
  onRetry: () => void
}

/** 見つからない理由を、利用者が次に何をすればよいか分かる言葉で出す */
function noticeFor(data: LookupResultData, id: string): string {
  if (data.missing.includes(id))
    return 'は見つかりませんでした。削除されたか、存在しない ID です。'
  if (data.unavailable.includes(id)) return 'は非公開などのため表示できません。'
  if (data.hiddenIds.includes(id)) return 'は表示できない動画です。'
  if (data.failed.includes(id)) return 'を取得できませんでした。'
  return 'は NG に設定した条件に当たるため、表示していません。'
}

/** 動画IDで開いた結果。入力した順に、見つからなかった ID も同じ場所に理由を出す */
export function LookupResults({
  data,
  visibleIds,
  onQuickNGAdd,
  onSearchAsKeyword,
  onRetry,
}: LookupResultsProps) {
  const itemsById = new Map(data.items.map((item) => [item.id, item]))
  return (
    <>
      <div className={styles.head}>
        <h2 className={styles.label}>動画ID</h2>
        <div className={styles.tools}>
          <TagToggleButton />
          <button
            type="button"
            className={styles.link}
            onClick={onSearchAsKeyword}
          >
            キーワードとして検索
          </button>
        </div>
      </div>
      {data.overflow > 0 && (
        <p className={styles.overflow} role="status">
          一度に開けるのは {VIDEO_LOOKUP_MAX_IDS} 件までです。最初の{' '}
          {VIDEO_LOOKUP_MAX_IDS} 件を表示しています。
        </p>
      )}
      <ul className={styles.list}>
        {data.ids.map((id) => {
          const item = itemsById.get(id)
          if (item && visibleIds.has(id)) {
            return (
              <li key={id}>
                <RankingItemResponsive
                  item={item}
                  hideRank
                  flat
                  onQuickNGAdd={onQuickNGAdd}
                />
              </li>
            )
          }
          const failed = data.failed.includes(id)
          return (
            <li key={id} className={styles.notice}>
              <CircleAlert
                size={18}
                aria-hidden="true"
                className={styles.noticeIcon}
              />
              <span>
                <b className={styles.id}>{id}</b> {noticeFor(data, id)}
              </span>
              {failed && (
                <button
                  type="button"
                  className={styles.retry}
                  onClick={onRetry}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  もう一度
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
