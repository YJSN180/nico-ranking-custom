import { MylistsClient } from './mylists-client'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { Footer } from '@/components/footer'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'マイリスト | ニコラン(Re:turn)',
  description: 'お気に入りの動画をマイリストで管理',
}

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