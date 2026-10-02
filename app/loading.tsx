import { HeaderWithSettings } from '@/components/header-with-settings'
import { RankingPageSkeleton } from '@/components/suspense-wrapper'

// サーバー側のランキング取得を待つ間も、ページの骨格を先に表示する。
export default function Loading() {
  return (
    <main id="main-content" style={{ minHeight: 'calc(100vh - 80px)' }}>
      <HeaderWithSettings />
      <div
        className="main-container-responsive"
        style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}
      >
        <RankingPageSkeleton />
      </div>
    </main>
  )
}
