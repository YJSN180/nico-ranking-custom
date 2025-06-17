'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

const NAV_ITEMS = [
  { href: '/', label: 'ホーム' },
  { href: '/about', label: 'このサイトについて' },
  { href: '/changelog', label: '更新履歴' },
  { href: '/contact', label: 'お問い合わせ' },
  { href: '/privacy', label: 'プライバシーポリシー' },
]

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useMobileDetect()
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // モバイルメニューの外側クリックで閉じる
  useEffect(() => {
    if (!isMobile || !isOpen) return

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
  }, [isMobile, isOpen])

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

  // モバイルメニューのボディスクロール制御
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, isOpen])

  // 768px以下でモバイル表示
  const shouldShowMobile = isMobile || (typeof window !== 'undefined' && window.innerWidth <= 768)

  if (shouldShowMobile) {
    return (
      <>
        {/* ハンバーガーメニューボタン */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={isOpen}
          aria-controls="navigation-menu"
          style={{
            position: 'absolute',
            top: isMobile ? '12px' : '16px',
            left: isMobile ? '12px' : '16px',
            background: 'rgba(255, 255, 255, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            padding: isMobile ? '4px 8px' : '6px 10px',
            color: 'white',
            fontSize: isMobile ? '16px' : '18px',
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
            if (!isMobile) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'
              e.currentTarget.style.transform = 'scale(1.05)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobile) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
              e.currentTarget.style.transform = 'scale(1)'
            }
          }}
        >
          <span style={{ fontSize: '20px' }}>☰</span>
        </button>

        {/* モバイルメニュー（サイドドロワー） */}
        {isOpen && (
          <>
            {/* 背景オーバーレイ */}
            <div
              onClick={() => setIsOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 30,
                animation: 'fadeIn 0.2s ease-in-out',
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
                background: 'var(--card-bg)',
                boxShadow: '2px 0 10px rgba(0, 0, 0, 0.2)',
                zIndex: 40,
                transform: 'translateX(0)',
                animation: 'slideIn 0.2s ease-out',
                overflowY: 'auto',
              }}
            >
              <div style={{ padding: '20px' }}>
                <h2 style={{
                  color: 'var(--text-primary)',
                  fontSize: '20px',
                  marginBottom: '20px',
                  fontWeight: 'bold',
                }}>
                  メニュー
                </h2>
                
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {NAV_ITEMS.map((item) => (
                    <li key={item.href} style={{ marginBottom: '8px' }}>
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        style={{
                          display: 'block',
                          padding: '12px 16px',
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          borderRadius: '8px',
                          transition: 'background-color 0.2s',
                          background: 'var(--bg-secondary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                        }}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </>
        )}
      </>
    )
  }

  // デスクトップ版（ドロップダウンメニュー）
  return (
    <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 20 }}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="メニュー"
        aria-expanded={isOpen}
        aria-controls="navigation-dropdown"
        style={{
          background: 'rgba(255, 255, 255, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '6px',
          padding: '6px 12px',
          color: 'white',
          fontSize: '16px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
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
        <span style={{ fontSize: '18px' }}>☰</span>
        <span>メニュー</span>
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <nav
          ref={menuRef}
          id="navigation-dropdown"
          role="navigation"
          aria-label="メインナビゲーション"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '8px',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            minWidth: '200px',
            padding: '8px',
            animation: 'dropIn 0.15s ease-out',
          }}
        >
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {NAV_ITEMS.map((item, index) => (
              <li key={item.href}>
                {index === 4 && (
                  <hr style={{
                    margin: '8px 0',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                  }} />
                )}
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: 'block',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* アニメーションのスタイル */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        
        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}