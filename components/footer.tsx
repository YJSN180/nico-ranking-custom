'use client'

import Link from 'next/link'

export function Footer() {
  return (
    <footer style={{
      marginTop: '80px',
      padding: '40px 20px',
      background: 'var(--surface-color)',
      borderTop: '1px solid var(--border-color)',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          marginBottom: '20px',
          fontSize: '14px',
          color: 'var(--text-secondary)',
        }}>
          <Link 
            href="/privacy" 
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              marginRight: '20px',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            プライバシーポリシー
          </Link>
          <a 
            href="https://www.nicovideo.jp/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ニコニコ動画
          </a>
        </div>
        <div style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}>
          このサイトはニコニコ動画の非公式ファンサイトです。<br />
          ニコニコ動画は株式会社ドワンゴの登録商標です。
        </div>
      </div>
    </footer>
  )
}