import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'このサイトについて | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)は、ニコニコ動画のランキングを快適に表示するためのサイトです。',
  openGraph: {
    title: 'このサイトについて | ニコラン(Re:turn)',
    description: 'ニコラン(Re:turn)の特徴・使い方について',
  },
}

export default function AboutPage() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
    }}>
      <h1 style={{
        fontSize: '2rem',
        marginBottom: '32px',
        color: 'var(--text-primary)',
        fontWeight: 'bold',
      }}>
        このサイトについて
      </h1>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          ニコラン(Re:turn)とは
        </h2>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '16px',
          color: 'var(--text-secondary)',
        }}>
          ニコラン(Re:turn)は、ニコニコ動画のランキングを快適に表示するためのサイトです。
          nico-rank.comからいつでもアクセスできます。
        </p>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          デザイン・機能
        </h2>
        
        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          デザイン
        </h3>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          2025年4月7日に行われたニコニコ動画のランキング変更前のデザインをベースにしています。
          ランキングに載っている動画一覧を俯瞰したい人におすすめです。
          本サイトに広告は一切ありません。
        </p>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          ランキング動画一覧表示
        </h3>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          毎時0分・30分更新。現在のニコニコ動画は毎時20分頃にランキングが更新されるため、
          毎時30分に実際の更新が反映される可能性が高いです。
        </p>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          テーマ切り替え
        </h3>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          サイト右上の設定ボタンから「表示設定」を開いてください。
          ライトモード・ダークモード・ダークブルーの3テーマに対応しています。
        </p>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          NGフィルター機能
        </h3>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '12px',
          color: 'var(--text-secondary)',
        }}>
          明確に「荒らし」と判定される動画は、管理者側で常にフィルタリングしています。
          要望がある場合はお問い合わせください。
        </p>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          サイト右上の設定ボタンから「NGリスト管理」を開いてください。
          ここから見たくない動画をブロックすると、ランキングからその動画が消えるようになり、
          順位もそれに合わせて変更されます。
        </p>
      </section>

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