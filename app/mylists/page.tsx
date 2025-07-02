import dynamic from 'next/dynamic'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { Footer } from '@/components/footer'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト | ニコラン(Re:turn)',
  description: 'お気に入りの動画をマイリストで管理',
}

// MylistsClientを動的インポートで遅延ロード
const MylistsClient = dynamic(
  () => import('./mylists-client').then(mod => ({ default: mod.MylistsClient })),
  {
    loading: () => (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '18px',
            fontWeight: '500',
            marginBottom: '8px'
          }}>
            マイリストを読み込んでいます
          </div>
          <div style={{ 
            fontSize: '14px',
            opacity: 0.7
          }}>
            しばらくお待ちください...
          </div>
        </div>
      </div>
    ),
    ssr: false  // クライアントサイドのみでレンダリング（IndexedDB依存のため）
  }
)

export default function MylistsPage() {
  return (
    <main style={{ 
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
        <MylistsClient />
      </div>
      <Footer />
    </main>
  )
}