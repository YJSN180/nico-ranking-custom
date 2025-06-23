import { Suspense } from 'react'
import { InitialRankingSkeleton } from './initial-ranking-skeleton'

interface SuspenseWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
  return (
    <Suspense fallback={fallback || <InitialRankingSkeleton />}>
      {children}
    </Suspense>
  )
}