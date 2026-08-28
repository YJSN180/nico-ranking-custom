'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import styles from './navigation.module.css'
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
  GuideIcon,
  MylistIcon,
  SearchIcon
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
  { href: '/search', label: '動画検索', icon: <SearchIcon />, section: 'main' },
  { href: '/mylists', label: 'マイリスト', icon: <MylistIcon />, section: 'main' },
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
  
  // 情報セクション
  { href: '/about', label: 'このサイトについて', icon: <InfoIcon />, section: 'info' },
  { href: '/contact', label: 'お問い合わせ', icon: <MailIcon />, section: 'info' },
  { href: '/privacy', label: 'プライバシーポリシー', icon: <ShieldIcon />, section: 'info' },
  { href: '/changelog', label: '更新履歴', icon: <HistoryIcon />, section: 'info' },
]

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { preferences, updatePreferences } = useUserPreferences()
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  // 退場アニメーション付きでメニューを閉じる
  const closeMenu = useCallback(() => {
    if (!isOpen || isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
    }, 180)
  }, [isOpen, isClosing])

  // 設定モーダルを開く関数
  const openSettings = () => {
    closeMenu()
    // 設定モーダルを開くイベントを発火
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('openSettings'))
    }
  }

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
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeMenu])

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeMenu])

  // サイドドロワー表示時のボディスクロール制御
  useEffect(() => {
    // テスト環境対応
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    
    // CSSメディアクエリでモバイル判定 - 防御的コーディング
    const mediaQuery = window.matchMedia && window.matchMedia('(max-width: 768px)')
    
    if (mediaQuery && mediaQuery.matches && isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // メディアクエリによるモバイル判定（CSS-only対応のため、JavaScriptでの判定は最小限に）
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  
  useEffect(() => {
    // テスト環境対応
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    
    // メディアクエリでモバイル判定
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    setShowMobileMenu(mediaQuery.matches)
    
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setShowMobileMenu(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleMediaChange)
    return () => mediaQuery.removeEventListener('change', handleMediaChange)
  }, [])

  if (showMobileMenu) {
    return (
      <>
        {/* ハンバーガーメニューボタン */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={isOpen}
          aria-controls="navigation-menu"
          className={`${styles.menuButton} ${isTouching ? styles.touching : ''}`}
          onTouchStart={() => setIsTouching(true)}
          onTouchEnd={() => setIsTouching(false)}
        >
          <span className={`${styles.hamburgerIcon} ${isOpen ? styles.open : ''}`}>
            <HamburgerIcon color="white" />
          </span>
        </button>

        {/* モバイルメニュー（サイドドロワー） */}
        {(isOpen || isClosing) && (
          <>
            {/* 背景オーバーレイ */}
            <div
              onClick={() => closeMenu()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                  closeMenu()
                }
              }}
              aria-label="メニューを閉じる（背景をタップ）"
              className={`${styles.overlay}${isClosing ? ` ${styles.overlayClosing}` : ''}`}
            />

            {/* サイドメニュー */}
            <nav
              ref={menuRef}
              id="navigation-menu"
              role="navigation"
              aria-label="メインナビゲーション"
              className={`${styles.drawer}${isClosing ? ` ${styles.drawerClosing}` : ''}`}
            >
              <div className={styles.drawerContent}>
                <div className={styles.drawerHeader}>
                  <h2 className={styles.drawerTitle}>
                    メニュー
                  </h2>
                  <button
                    onClick={() => closeMenu()}
                    aria-label="メニューを閉じる"
                    className={styles.closeButton}
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>
                
                <div className={styles.drawerSections}>
                  {/* メインセクション */}
                  <section>
                    <ul>
                      {NAV_ITEMS.filter(item => item.section === 'main').map((item) => (
                        <li key={item.href}>
                          {item.href === '#settings' ? (
                            <button
                              onClick={openSettings}
                              className={`${styles.navLinkMobile} ${pathname === item.href ? styles.active : ''}`}
                              style={{ width: '100%', border: 'none', textAlign: 'left' }}
                            >
                              <span className={styles.iconWrapper}>{item.icon}</span>
                              <span>{item.label}</span>
                            </button>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={() => closeMenu()}
                              onMouseEnter={() => {
                                if (item.href === '/mylists') {
                                  router.prefetch('/mylists')
                                }
                              }}
                              className={`${styles.navLinkMobile} ${pathname === item.href ? styles.active : ''}`}
                            >
                              <span style={{ width: '20px', height: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* テーマ切り替えセクション */}
                  <section className={styles.themeSection}>
                    <div className={styles.themeSectionHeader}>
                      <ThemeIcon size={16} />
                      <span>テーマ</span>
                    </div>
                    <div className={styles.themeSectionButtons}>
                      <button
                        onClick={() => {
                          updatePreferences({ theme: 'light' })
                          if (typeof document !== 'undefined') {
                            document.documentElement.setAttribute('data-theme', 'light')
                          }
                        }}
                        className={`${styles.themeButton} ${preferences.theme === 'light' ? styles.active : ''}`}
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
                        className={`${styles.themeButton} ${preferences.theme === 'dark' ? styles.active : ''}`}
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
                        className={`${styles.themeButton} ${preferences.theme === 'darkblue' ? styles.active : ''}`}
                      >
                        🌌
                      </button>
                    </div>
                  </section>

                  {/* 外部リンクセクション */}
                  <section>
                    <ul>
                      {NAV_ITEMS.filter(item => item.section === 'external').map((item) => (
                        <li key={item.href}>
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => closeMenu()}
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
                            <span style={{ width: '20px', height: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
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
                                    onClick={() => closeMenu()}
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
                  <hr className={styles.divider} />

                  {/* 情報セクション */}
                  <section>
                    <ul>
                      {NAV_ITEMS.filter(item => item.section === 'info').map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => closeMenu()}
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
                            <span className={styles.iconWrapper}>{item.icon}</span>
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

  // デスクトップ版（ドロップダウンメニュー）
  return (
    <div className={styles.desktopContainer}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="メニュー"
        aria-expanded={isOpen}
        aria-controls="navigation-dropdown"
        className={styles.menuButton}
      >
        <span className={`${styles.hamburgerIcon} ${isOpen ? styles.open : ''}`}>
          <HamburgerIcon />
        </span>
      </button>

      {/* ドロップダウンメニュー */}
      {(isOpen || isClosing) && (
        <nav
          ref={menuRef}
          id="navigation-dropdown"
          role="navigation"
          aria-label="メインナビゲーション"
          className={`${styles.dropdown}${isClosing ? ` ${styles.dropdownClosing}` : ''}`}
        >
          <div className={styles.menuContent}>
            {/* メインセクション */}
            <section>
              <ul>
                {NAV_ITEMS.filter(item => item.section === 'main').map((item) => (
                  <li key={item.href}>
                    {item.href === '#settings' ? (
                      <button
                        onClick={openSettings}
                        className={`${styles.navLinkDesktop} ${pathname === item.href ? styles.active : ''}`}
                        style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent' }}
                      >
                        <span className={`${styles.iconWrapper} ${styles.desktop}`}>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={() => closeMenu()}
                        onMouseEnter={() => {
                          if (item.href === '/mylists') {
                            router.prefetch('/mylists')
                          }
                        }}
                        className={`${styles.navLinkDesktop} ${pathname === item.href ? styles.active : ''}`}
                      >
                        <span className={`${styles.iconWrapper} ${styles.desktop}`}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* 外部リンクセクション */}
            <section>
              <ul>
                {NAV_ITEMS.filter(item => item.section === 'external').map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => closeMenu()}
                      className="nav-link-desktop"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        fontSize: '14px',
                      }}
                    >
                      <span style={{ width: '16px', height: '16px', flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <ExternalLinkIcon size={14} />
                    </a>
                    {item.subItems && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0 16px' }}>
                        {item.subItems.map((subItem) => (
                          <li key={subItem.href}>
                            <a
                              href={subItem.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => closeMenu()}
                              className="nav-link-desktop"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 10px',
                                color: 'var(--text-secondary)',
                                textDecoration: 'none',
                                borderRadius: '4px',
                                transition: 'background-color 0.2s',
                                fontSize: '13px',
                              }}
                            >
                              <span>↳</span>
                              <span style={{ flex: 1 }}>{subItem.label}</span>
                              <ExternalLinkIcon size={12} />
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
            <hr className={styles.divider} />

            {/* 情報セクション */}
            <section>
              <ul>
                {NAV_ITEMS.filter(item => item.section === 'info').map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => closeMenu()}
                      className="nav-link-desktop"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                        fontSize: '14px',
                        background: pathname === item.href ? 'var(--bg-hover)' : 'transparent',
                      }}
                    >
                      <span style={{ width: '16px', height: '16px', flexShrink: 0 }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </nav>
      )}

    </div>
  )
}