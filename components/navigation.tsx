'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/responsive-utils'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { 
  HamburgerIcon, 
  CloseIcon, 
  HomeIcon, 
  SettingsIcon, 
  InfoIcon, 
  MailIcon, 
  HistoryIcon, 
  ShieldIcon, 
  VideoIcon,
  ExternalLinkIcon,
  ThemeIcon,
  GuideIcon
} from './icons'

type NavItem = {
  href: string
  label: string
  icon?: React.ReactNode
  external?: boolean
  subItems?: NavItem[]
  section?: 'main' | 'info' | 'external'
}

const NAV_ITEMS: NavItem[] = [
  // メインセクション
  { href: '/', label: 'ホーム', icon: <HomeIcon />, section: 'main' },
  { href: '#settings', label: 'ランキング設定', icon: <SettingsIcon />, section: 'main' },
  
  // 外部リンクセクション  
  { 
    href: 'https://www.nicovideo.jp/', 
    label: 'ニコニコ動画',
    icon: <VideoIcon />,
    external: true,
    section: 'external',
    subItems: [
      { href: 'https://www.nicovideo.jp/ranking', label: 'ランキング（公式）', external: true }
    ]
  },
  { href: 'https://www.nicochart.jp', label: 'ニコニコチャート', icon: <ExternalLinkIcon />, external: true, section: 'external' },
  { href: 'https://www.nicolog.jp', label: 'ニコログ', icon: <ExternalLinkIcon />, external: true, section: 'external' },
  { href: 'https://810video.com', label: '野獣動画2nd', icon: <ExternalLinkIcon />, external: true, section: 'external' },
  { href: 'https://yajuvideo.in', label: 'ヤジュヤジュ動画', icon: <ExternalLinkIcon />, external: true, section: 'external' },
  
  // 情報セクション
  { href: '/about', label: 'このサイトについて', icon: <InfoIcon />, section: 'info' },
  { href: '/contact', label: 'お問い合わせ', icon: <MailIcon />, section: 'info' },
  { href: '/privacy', label: 'プライバシーポリシー', icon: <ShieldIcon />, section: 'info' },
  { href: '/changelog', label: '更新履歴', icon: <HistoryIcon />, section: 'info' },
]

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const pathname = usePathname()
  const { preferences, updatePreferences } = useUserPreferences()
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  // 設定モーダルを開く関数
  const openSettings = () => {
    setIsOpen(false)
    // 設定モーダルを開くイベントを発火
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('openSettings'))
    }
  }

  // マウント状態を管理
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // メニューの外側クリックで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  // メニューオープン時のボディスクロール制御
  useEffect(() => {
    // モバイルメニューが開いている時のみスクロールを無効化
    const mediaQuery = window.matchMedia('(max-width: 640px)')
    
    if (mediaQuery.matches && isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // モバイル版UIに統一（全画面サイズで使用）
  return (
    <div 
      style={{ 
        opacity: isMounted ? '1' : '0',
        transition: 'opacity 0.2s'
      }}
    >
      {renderMobileNavigation()}
    </div>
  )

  function renderMobileNavigation() {
    return (
      <>
        {/* ハンバーガーメニューボタン */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="メニュー"
          aria-expanded={isOpen}
          aria-controls="navigation-menu"
          style={{
            position: 'absolute',
            top: '10px',
            left: '12px',
            background: 'rgba(255, 255, 255, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            padding: '4px 8px',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <HamburgerIcon size={20} color="white" />
        </button>

        {/* モバイルメニュー（サイドドロワー） */}
        {isOpen && (
          <>
            {/* 背景オーバーレイ */}
            <div
              onClick={() => setIsOpen(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                  setIsOpen(false)
                }
              }}
              aria-label="メニューを閉じる（背景をタップ）"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                zIndex: 30,
                animation: 'fadeIn 0.2s ease-in-out',
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
                cursor: 'pointer',
              }}
            />

            {/* サイドメニュー */}
            <nav
              ref={menuRef}
              id="navigation-menu"
              role="navigation"
              aria-label="メインナビゲーション"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: '280px',
                maxWidth: '80vw',
                background: 'var(--menu-bg)',
                boxShadow: '2px 0 10px rgba(0, 0, 0, 0.2)',
                zIndex: 40,
                transform: 'translateX(0)',
                animation: 'slideIn 0.2s ease-out',
                overflowY: 'auto',
              }}
            >
              <div style={{ padding: '20px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                }}>
                  <h2 style={{
                    color: 'var(--text-primary)',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    margin: 0,
                  }}>
                    メニュー
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    aria-label="メニューを閉じる"
                    style={{
                      background: 'transparent',
                      border: '2px solid var(--text-secondary)',
                      borderRadius: '50%',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '24px',
                      color: 'var(--text-primary)',
                      transition: 'all 0.2s',
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.background = 'var(--menu-item-bg)'
                      e.currentTarget.style.transform = 'scale(0.95)'
                    }}
                    onTouchEnd={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* メインセクション */}
                  <section>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {NAV_ITEMS.filter(item => item.section === 'main').map((item) => (
                        <li key={item.href} style={{ marginBottom: '8px' }}>
                          {item.href === '#settings' ? (
                            <button
                              onClick={openSettings}
                              className="nav-link-mobile"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                width: '100%',
                                padding: '12px 16px',
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                borderRadius: '8px',
                                transition: 'background-color 0.2s',
                                background: pathname === item.href ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ width: '20px', height: '20px', flexShrink: 0 }}>{item.icon}</span>
                              <span>{item.label}</span>
                            </button>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              className="nav-link-mobile"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                borderRadius: '8px',
                                transition: 'background-color 0.2s',
                                background: pathname === item.href ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                              }}
                            >
                              <span style={{ width: '20px', height: '20px', flexShrink: 0 }}>{item.icon}</span>
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* テーマ切り替えセクション */}
                  <section style={{ 
                    padding: '16px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      marginBottom: '12px',
                      color: 'var(--text-secondary)',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}>
                      <ThemeIcon size={16} />
                      <span>テーマ</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          updatePreferences({ theme: 'light' })
                          if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', 'light')
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          background: preferences.theme === 'light' ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                        }}
                      >
                        ☀️
                      </button>
                      <button
                        onClick={() => {
                          updatePreferences({ theme: 'dark' })
                          if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', 'dark')
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          background: preferences.theme === 'dark' ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                        }}
                      >
                        🌙
                      </button>
                      <button
                        onClick={() => {
                          updatePreferences({ theme: 'darkblue' })
                          if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', 'darkblue')
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          background: preferences.theme === 'darkblue' ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'all 0.2s',
                        }}
                      >
                        🌌
                      </button>
                    </div>
                  </section>

                  {/* 外部リンクセクション */}
                  <section>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {NAV_ITEMS.filter(item => item.section === 'external').map((item) => (
                        <li key={item.href} style={{ marginBottom: '8px' }}>
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsOpen(false)}
                            className="nav-link-mobile"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 16px',
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                              borderRadius: '8px',
                              transition: 'background-color 0.2s',
                              background: 'var(--bg-secondary)',
                            }}
                          >
                            <span style={{ width: '20px', height: '20px', flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ flex: 1 }}>{item.label}</span>
                            <ExternalLinkIcon size={16} />
                          </a>
                          {item.subItems && (
                            <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0 20px' }}>
                              {item.subItems.map((subItem) => (
                                <li key={subItem.href} style={{ marginBottom: '4px' }}>
                                  <a
                                    href={subItem.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsOpen(false)}
                                    className="nav-link-mobile"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '10px 14px',
                                      color: 'var(--text-secondary)',
                                      textDecoration: 'none',
                                      borderRadius: '6px',
                                      transition: 'background-color 0.2s',
                                      background: 'var(--bg-secondary)',
                                      fontSize: '14px',
                                    }}
                                  >
                                    <span style={{ marginLeft: '20px' }}>↳</span>
                                    <span style={{ flex: 1 }}>{subItem.label}</span>
                                    <ExternalLinkIcon size={14} />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* 区切り線 */}
                  <hr style={{ 
                    border: 'none', 
                    borderTop: '1px solid var(--border-color)', 
                    margin: '0' 
                  }} />

                  {/* 情報セクション */}
                  <section>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {NAV_ITEMS.filter(item => item.section === 'info').map((item) => (
                        <li key={item.href} style={{ marginBottom: '8px' }}>
                          <Link
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className="nav-link-mobile"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 16px',
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                              borderRadius: '8px',
                              transition: 'background-color 0.2s',
                              background: pathname === item.href ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                            }}
                          >
                            <span style={{ width: '20px', height: '20px', flexShrink: 0 }}>{item.icon}</span>
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            </nav>
          </>
        )}
      </>
    )
  }

}