import Image from 'next/image'
import Link from 'next/link'

interface HeaderStaticProps {
  isMobile: boolean
}

// サーバーコンポーネント（'use client'ディレクティブなし）
export function HeaderStatic({ isMobile }: HeaderStaticProps) {
  return (
    <header role="banner" className="header-container" style={{
      background: 'var(--header-bg)',
      padding: isMobile ? '5px 12px' : '8px 20px',
      boxShadow: 'var(--shadow-md)',
      marginBottom: '20px',
      position: 'relative'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto',
        padding: isMobile ? '0 60px' : '0 120px' // 両サイドのボタンのスペースを確保
      }}>
        <Link 
          href="/" 
          style={{ 
            textDecoration: 'none',
            display: 'block'
          }}
        >
          <h1 style={{ 
            color: '#ffffff', 
            margin: 0,
            textAlign: 'center',
            fontSize: isMobile ? '22px' : '48px',
            fontWeight: '700',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            letterSpacing: '0.02em',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? '4px' : '12px',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          >
            <div style={{
              position: 'relative',
              width: isMobile ? '48px' : '106px',
              height: isMobile ? '48px' : '106px',
              filter: 'brightness(0) invert(1)', // 白色に変換
              opacity: 0.95,
              marginRight: isMobile ? '-5px' : '-20px', // タイトルとやや重なるように
            }}>
              <Image
                src="/icon.png"
                alt="ニコラン(Re:turn) ロゴ"
                fill
                sizes={isMobile ? "48px" : "106px"}
                style={{
                  objectFit: 'contain'
                }}
                priority
              />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'nowrap',
              whiteSpace: 'nowrap'
            }}>
              <span style={{
                fontFamily: '"Nicomoji Plus v2", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Meiryo", sans-serif',
                fontSize: 'inherit'
              }}>ニコラン</span>
              <span style={{
                fontFamily: '"Comic Sans MS Bold", Arial, sans-serif',
                fontSize: '85%',
                marginLeft: '0.05em'
              }}>(Re:turn)</span>
            </div>
          </h1>
        </Link>
      </div>
    </header>
  )
}