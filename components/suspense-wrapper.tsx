import { Suspense } from 'react'
import InitialRankingSkeleton from './initial-ranking-skeleton'
import { ErrorBoundary } from './error-boundary'

interface SuspenseWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RankingPageSkeleton() {
  return (
    <div role="status" aria-label="ランキングを読み込み中" aria-busy="true">
      {/* セレクターエリアのスケルトン */}
      <div className="selectors-container" style={{ minHeight: '200px' }}>
        <div
          className="skeleton-pulse"
          style={{
            background: 'var(--surface-secondary)',
            height: '40px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        />
        <div
          className="skeleton-pulse"
          style={{
            background: 'var(--surface-secondary)',
            height: '40px',
            borderRadius: '8px',
          }}
        />
      </div>

      {/* ランキングアイテムのスケルトン */}
      <InitialRankingSkeleton itemCount={5} />
    </div>
  )
}

export function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback || <RankingPageSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}
