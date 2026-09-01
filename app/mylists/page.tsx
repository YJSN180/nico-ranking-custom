import dynamic from 'next/dynamic'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { FooterLazy } from '@/components/footer-lazy'
import { ErrorBoundary } from '@/components/error-boundary'
import { ScrollToTopButton } from '@/components/scroll-to-top-button'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト | ニコラン(Re:turn)',
  description: 'お気に入りの動画をマイリストで管理',
}

// MylistsClientを動的インポートで遅延ロード（優先度高で事前ロード）
const MylistsClient = dynamic(
  () => import('./mylists-client').then(mod => ({ default: mod.MylistsClient })),
  {
    loading: () => null // スケルトンUIをMylistsClient内で表示するため、ここでは何も表示しない
  }
)

// 注：プリロードはクライアントコンポーネント内で行う必要があるため削除

export default function MylistsPage() {
  return (
    <main id="main-content" style={{ 
      padding: '0',
      minHeight: 'calc(100vh - 80px)',
      background: 'var(--background-color)'
    }}>
      <HeaderWithSettings />
      <div 
        className="main-container-responsive"
        style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '20px',
          minHeight: 'calc(100vh - 100px)'
        }}>
        <ErrorBoundary>
          <MylistsClient />
        </ErrorBoundary>
      </div>
      <ScrollToTopButton />
      <FooterLazy />
    </main>
  )
}