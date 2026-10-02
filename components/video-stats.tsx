import { Folder, Heart, MessageCircle, Play } from 'lucide-react'
import { formatNumberCompact, formatNumberMobile } from '@/lib/format-utils'
import styles from './video-stats.module.css'

const metrics = [
  { key: 'views', label: '再生数', Icon: Play },
  { key: 'comments', label: 'コメント数', Icon: MessageCircle },
  { key: 'likes', label: 'いいね数', Icon: Heart },
  { key: 'mylists', label: 'マイリスト数', Icon: Folder },
] as const

type Counts = Partial<Record<(typeof metrics)[number]['key'], number>>

/** 保存時点で未取得の数値はゼロと区別する。表示のための追加取得は行わない。 */
export function VideoStats({
  counts = {},
  className = '',
  loading = false,
}: {
  counts?: Counts
  className?: string
  loading?: boolean
}) {
  return (
    <div
      className={`${styles.stats} ${className}`}
      data-testid={loading ? undefined : 'video-stats'}
      aria-hidden={loading || undefined}
    >
      {metrics.map(({ key, label, Icon }) => {
        const value = counts[key]
        const known =
          typeof value === 'number' && Number.isFinite(value) && value >= 0
        const desktop = known ? formatNumberMobile(value) : '—'
        const mobile = known ? formatNumberCompact(value) : '—'
        return (
          <span
            key={key}
            className={`${styles.metric} ${styles[key]}`}
            title={
              loading
                ? undefined
                : `${label}: ${known ? value.toLocaleString('ja-JP') : '未取得'}`
            }
          >
            <Icon
              className={styles.icon}
              size={14}
              strokeWidth={1.5}
              fill="currentColor"
              aria-hidden="true"
            />
            {loading ? (
              <span className={`${styles.placeholder} skeleton-pulse`} />
            ) : (
              <>
                <span className={styles.srOnly}>
                  {label}
                  {known ? ' ' : ' 未取得 '}
                </span>
                <span className={styles.value}>
                  {desktop === mobile ? (
                    desktop
                  ) : (
                    <>
                      <span className={styles.desktop}>{desktop}</span>
                      <span className={styles.mobile}>{mobile}</span>
                    </>
                  )}
                </span>
              </>
            )}
          </span>
        )
      })}
    </div>
  )
}
