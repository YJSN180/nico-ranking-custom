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
    version: 'v2.3.0',
    changes: [
      { type: 'feature', description: 'サイト情報ページとナビゲーションシステムを追加' },
      { type: 'feature', description: 'モバイル対応のハンバーガーメニューを実装' },
      { type: 'improvement', description: 'ヘッダーレイアウトを最適化' },
    ],
  },
  {
    date: '2025-06-16',
    version: 'v2.2.0',
    changes: [
      { type: 'feature', description: 'テーマ切り替え機能（ライト/ダーク/ダークブルー）を追加' },
      { type: 'improvement', description: 'モバイル表示でのジャンル・タグ選択をスクロール可能に改善' },
      { type: 'fix', description: 'ヘッダータイトルが重なる問題を修正' },
    ],
  },
  {
    date: '2025-06-15',
    version: 'v2.1.0',
    changes: [
      { type: 'feature', description: 'ページネーション機能（最大500件表示）を追加' },
      { type: 'feature', description: 'URLパラメータによる表示件数の保存' },
      { type: 'improvement', description: 'ブラウザの戻るボタンでの状態復元を改善' },
      { type: 'fix', description: 'スクロール位置の復元を修正' },
    ],
  },
  {
    date: '2025-06-14',
    version: 'v2.0.0',
    changes: [
      { type: 'feature', description: '人気タグ別ランキング機能を追加' },
      { type: 'feature', description: '投稿日時の表示機能を追加' },
      { type: 'improvement', description: 'タグランキングのパフォーマンスを最適化' },
      { type: 'fix', description: 'NGフィルター適用時のランク番号を修正' },
    ],
  },
  {
    date: '2025-06-13',
    version: 'v1.5.0',
    changes: [
      { type: 'feature', description: '高度なセキュリティヘッダーを実装' },
      { type: 'security', description: 'CSP（Content Security Policy）を強化' },
      { type: 'security', description: 'レート制限を多層防御システムに更新' },
      { type: 'improvement', description: 'Cloudflare Workersを最適化' },
    ],
  },
  {
    date: '2025-06-12',
    version: 'v1.4.0',
    changes: [
      { type: 'feature', description: '24時間・毎時ランキングの切り替え機能を追加' },
      { type: 'feature', description: 'リアルタイム統計更新（1分ごと）を実装' },
      { type: 'improvement', description: 'キャッシュ戦略を最適化' },
    ],
  },
  {
    date: '2025-06-11',
    version: 'v1.3.0',
    changes: [
      { type: 'feature', description: 'NGフィルター機能（動画・投稿者ブロック）を追加' },
      { type: 'feature', description: '設定のインポート・エクスポート機能を追加' },
      { type: 'improvement', description: 'LocalStorageによる設定の永続化' },
    ],
  },
  {
    date: '2025-06-10',
    version: 'v1.2.0',
    changes: [
      { type: 'improvement', description: '10分ごとの自動更新システムを実装' },
      { type: 'improvement', description: 'Cloudflare KVによる高速キャッシュを導入' },
      { type: 'fix', description: 'ジオブロッキング回避の改善' },
    ],
  },
  {
    date: '2025-06-09',
    version: 'v1.1.0',
    changes: [
      { type: 'feature', description: '全ジャンル対応（ゲーム、エンタメ、その他など）' },
      { type: 'feature', description: 'モバイル対応レスポンシブデザイン' },
      { type: 'improvement', description: 'TypeScript化による型安全性の向上' },
    ],
  },
  {
    date: '2025-06-08',
    version: 'v1.0.0',
    changes: [
      { type: 'feature', description: 'ニコニコ動画ランキングの基本表示機能' },
      { type: 'feature', description: 'サムネイル・再生数・コメント数の表示' },
      { type: 'feature', description: 'Next.js 14 App Routerによる高速レンダリング' },
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