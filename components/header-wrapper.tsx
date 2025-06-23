import { headers } from 'next/headers'
import { HeaderStatic } from './header-static'
import { HeaderInteractive } from './header-interactive'
import { isMobileFromHeaders } from '@/lib/user-agent'

// サーバーコンポーネント
export async function HeaderWrapper() {
  // サーバーサイドでモバイル判定
  const headersStore = await headers()
  const isMobile = isMobileFromHeaders(headersStore)
  
  return (
    <header role="banner" className="header-container" style={{
      background: 'var(--header-bg)',
      padding: isMobile ? '5px 12px' : '8px 20px',
      boxShadow: 'var(--shadow-md)',
      marginBottom: '20px',
      position: 'relative'
    }}>
      <HeaderStatic isMobile={isMobile} />
      <HeaderInteractive isMobile={isMobile} />
    </header>
  )
}