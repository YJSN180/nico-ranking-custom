'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, SearchIcon, MylistIcon, SettingsIcon } from './icons'
import './bottom-nav.css'

// モバイル用ボトムナビゲーション（フェーズ3-1）
// 主要導線（ホーム/検索/マイリスト/設定）を常時1タップにする。
// 表示はCSS側で 640px 以下に限定（サイトのモバイル境界に合わせる）
const NAV_LINKS = [
  { href: '/', label: 'ホーム', icon: HomeIcon },
  { href: '/search', label: '検索', icon: SearchIcon },
  { href: '/mylists', label: 'マイリスト', icon: MylistIcon }
] as const

export function BottomNav() {
  const pathname = usePathname()

  // 管理画面ではボトムナビを出さない
  if (pathname.startsWith('/admin')) {
    return null
  }

  const openSettings = () => {
    // 設定モーダルは HeaderWithSettings が openSettings イベントで開く（既存機構）
    window.dispatchEvent(new Event('openSettings'))
  }

  return (
    <nav className="bottom-nav" aria-label="ボトムナビゲーション">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="bottom-nav__label">{label}</span>
          </Link>
        )
      })}
      <button
        type="button"
        className="bottom-nav__item"
        onClick={openSettings}
        data-testid="bottom-nav-settings"
      >
        <span className="bottom-nav__icon" aria-hidden="true">
          <SettingsIcon />
        </span>
        <span className="bottom-nav__label">設定</span>
      </button>
    </nav>
  )
}
