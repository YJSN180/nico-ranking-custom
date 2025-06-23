import { Suspense } from 'react'
import InitialRankingSkeleton from './initial-ranking-skeleton'
import { ErrorBoundary } from './error-boundary'

interface SuspenseWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
  const defaultFallback = (
    <div>
      {/* セレクターエリアのスケルトン */}
      <div className="selectors-container" style={{ minHeight: '200px' }}>
        <div className="skeleton-pulse" style={{ 
          background: 'var(--surface-secondary)', 
          height: '40px', 
          borderRadius: '8px', 
          marginBottom: '16px'
        }} />
        <div className="skeleton-pulse" style={{ 
          background: 'var(--surface-secondary)', 
          height: '40px', 
          borderRadius: '8px'
        }} />
      </div>
      
      {/* ランキングアイテムのスケルトン */}
      <InitialRankingSkeleton itemCount={5} />
    </div>
  )
  
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback || defaultFallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}