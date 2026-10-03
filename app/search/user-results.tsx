'use client'

import { Ban, ChevronDown, ExternalLink } from 'lucide-react'
import controlStyles from '@/components/control.module.css'
import Pagination from '@/components/pagination'
import { OptimizedImage } from '@/components/optimized-image'
import { formatNumber } from '@/lib/format-utils'
import { getLinkTarget } from '@/lib/pwa-utils'
import {
  USER_SEARCH_MAX_PAGE,
  USER_SEARCH_PAGE_SIZE,
  USER_SEARCH_SORT_OPTIONS,
  type SearchUser,
  type UserSearchConditions,
  type UserSearchSort,
} from '@/lib/search/user-search'
import styles from './user-results.module.css'

interface UserResultsProps {
  conditions: UserSearchConditions
  items: SearchUser[]
  totalCount: number
  onSortChange: (sort: UserSearchSort) => void
  onPageChange: (page: number, fromBottom: boolean) => void
  /** 同じ語で動画の検索結果に戻る */
  onShowVideos: () => void
  onNG: (user: SearchUser) => void
}

const userUrl = (id: string): string => `https://www.nicovideo.jp/user/${id}`

/** ユーザー検索の結果。動画の結果と同じ場所に出し、［動画｜ユーザー］で同じ語のまま行き来する */
export function UserResults({
  conditions,
  items,
  totalCount,
  onSortChange,
  onPageChange,
  onShowVideos,
  onNG,
}: UserResultsProps) {
  const target = getLinkTarget()
  const rel = target === '_blank' ? 'noopener noreferrer' : undefined
  const totalPages = Math.max(
    1,
    Math.min(
      USER_SEARCH_MAX_PAGE,
      Math.ceil(totalCount / USER_SEARCH_PAGE_SIZE),
    ),
  )
  const pagination = (fromBottom: boolean) =>
    totalPages > 1 ? (
      <Pagination
        enableQuickNavigation
        className={fromBottom ? undefined : 'search-results__pagination'}
        currentPage={conditions.page}
        totalPages={totalPages}
        totalItems={totalCount}
        itemsPerPage={USER_SEARCH_PAGE_SIZE}
        onPageChange={(page) => onPageChange(page, fromBottom)}
      />
    ) : null

  return (
    <>
      <div className={styles.head}>
        <div
          className="search-form__types"
          role="radiogroup"
          aria-label="結果の種類"
        >
          <label className="search-form__type">
            <input
              type="radio"
              name="resultKind"
              checked={false}
              onChange={onShowVideos}
            />
            動画
          </label>
          <label className="search-form__type search-form__type--active">
            <input type="radio" name="resultKind" checked readOnly />
            ユーザー
          </label>
        </div>
        <span className={`${styles.sort} ${controlStyles.select}`}>
          <select
            className={controlStyles.selectInput}
            value={conditions.sort}
            onChange={(event) =>
              onSortChange(event.target.value as UserSearchSort)
            }
            aria-label="ユーザーの並び順"
          >
            {USER_SEARCH_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className={controlStyles.chevron}
            aria-hidden="true"
          />
        </span>
      </div>
      {pagination(false)}
      {items.length === 0 ? (
        <div className="search-results__status">
          「{conditions.q}」に一致するユーザーは見つかりませんでした。
        </div>
      ) : (
        <ul className={styles.list} aria-label="ユーザーの検索結果">
          {items.map((user) => (
            <li key={user.id} className={styles.row}>
              {user.iconUrl ? (
                <OptimizedImage
                  src={user.iconUrl}
                  alt=""
                  width={56}
                  height={56}
                  sizes="56px"
                  className={styles.avatar}
                  loading="lazy"
                />
              ) : (
                <span
                  className={`${styles.avatar} ${styles.initial}`}
                  aria-hidden="true"
                >
                  {user.name.slice(0, 1)}
                </span>
              )}
              <div className={styles.body}>
                <a
                  className={styles.name}
                  href={userUrl(user.id)}
                  target={target}
                  rel={rel}
                >
                  {user.name}
                </a>
                <span className={styles.meta}>
                  フォロワー <b>{formatNumber(user.followerCount)}</b> · 動画{' '}
                  <b>{formatNumber(user.videoCount)}本</b>
                </span>
                {user.description && (
                  <span className={styles.description}>{user.description}</span>
                )}
              </div>
              <div className={styles.actions}>
                <a
                  className={styles.action}
                  href={userUrl(user.id)}
                  target={target}
                  rel={rel}
                  aria-label={`${user.name}をニコニコで見る`}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  <span className={styles.actionLabel}>ニコニコで見る</span>
                </a>
                <button
                  type="button"
                  className={`${styles.action} ${styles.iconOnly}`}
                  aria-label={`${user.name}をNGに追加`}
                  title="NGに追加"
                  onClick={() => onNG(user)}
                >
                  <Ban size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pagination(true)}
    </>
  )
}

/** 取得中の行の形（アイコンと 2 行）。動画のスケルトンと同じ控えめな濃さ */
export function UserResultsSkeleton() {
  return (
    <ul className={styles.list} aria-label="ユーザーを検索中" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className={styles.row} aria-hidden="true">
          <span className={`${styles.avatar} ${styles.skeleton}`} />
          <span className={styles.body}>
            <span className={styles.skeletonLine} style={{ width: '32%' }} />
            <span className={styles.skeletonLine} style={{ width: '48%' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
