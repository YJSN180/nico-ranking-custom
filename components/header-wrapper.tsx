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
    <>
      <HeaderStatic isMobile={isMobile} />
      <HeaderInteractive isMobile={isMobile} />
    </>
  )
}