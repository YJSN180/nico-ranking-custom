import { Suspense } from 'react'

interface SuspenseWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SuspenseWrapper({ children, fallback }: SuspenseWrapperProps) {
  return (
    <Suspense fallback={fallback || <div style={{ textAlign: 'center', padding: '40px' }}>読み込み中...</div>}>
      {children}
    </Suspense>
  )
}