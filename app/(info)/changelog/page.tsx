import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '更新履歴 | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)の更新履歴・リリースノート',
  openGraph: {
    title: '更新履歴 | ニコラン(Re:turn)',
    description: 'ニコラン(Re:turn)の更新履歴・リリースノート',
  },
}

type ChangelogEntry = {
  date: string
  version: string
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'security'
    description: string
  }[]
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2025-06-17',
    version: 'v1.0.0',
    changes: [
      { type: 'feature', description: 'ニコニコ動画ランキングの基本表示機能' },
      { type: 'feature', description: 'サムネイル・再生数・コメント数の表示' },
      { type: 'feature', description: 'NGフィルター機能（動画・投稿者ブロック）' },
      { type: 'feature', description: '24時間・毎時ランキングの切り替え機能' },
      { type: 'feature', description: '人気タグ別ランキング機能' },
      { type: 'feature', description: 'テーマ切り替え機能（ライト/ダーク/ダークブルー）' },
      { type: 'feature', description: 'モバイル対応レスポンシブデザイン' },
      { type: 'feature', description: 'リアルタイム統計更新（1分ごと）' },
    ],
  },
]

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'feature': return '新機能'
    case 'fix': return '修正'
    case 'improvement': return '改善'
    case 'security': return 'セキュリティ'
    default: return type
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'feature': return '#10b981'
    case 'fix': return '#ef4444'
    case 'improvement': return '#3b82f6'
    case 'security': return '#f59e0b'
    default: return '#6b7280'
  }
}

export default function ChangelogPage() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
    }}>
      <h1 style={{
        fontSize: '2rem',
        marginBottom: '24px',
        color: 'var(--text-primary)',
        fontWeight: 'bold',
      }}>
        更新履歴
      </h1>

      <div>
        {CHANGELOG.map((entry, index) => (
          <section
            key={index}
            style={{
              marginBottom: '32px',
              padding: '24px',
              background: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
            }}>
              <h2 style={{
                fontSize: '1.3rem',
                color: 'var(--text-primary)',
                fontWeight: 'bold',
                margin: 0,
              }}>
                {entry.version}
              </h2>
              <time style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
              }}>
                {entry.date}
              </time>
            </div>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}>
              {entry.changes.map((change, changeIndex) => (
                <li
                  key={changeIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: 'white',
                      backgroundColor: getTypeColor(change.type),
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {getTypeLabel(change.type)}
                  </span>
                  <span style={{
                    color: 'var(--text-secondary)',
                    lineHeight: '1.6',
                  }}>
                    {change.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div style={{
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <Link
          href="/"
          style={{
            color: 'var(--link)',
            textDecoration: 'none',
            fontSize: '16px',
            transition: 'text-decoration 0.2s',
          }}
          className="hover-underline"
        >
          ← トップページに戻る
        </Link>
      </div>
    </div>
  )
}