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
      <div style={{
        marginBottom: '24px',
      }}>
        <Link
          href="/"
          style={{
            color: 'var(--link)',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          className="hover-underline"
        >
          ← トップページに戻る
        </Link>
      </div>
      
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
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
        }}>
          <li>ニコラン(Re:turn)は、ニコニコ動画のランキングを快適に表示するためのサイトです。</li>
          <li>nico-rank.comからいつでもアクセスできます。</li>
        </ul>
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
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
          marginBottom: '20px',
        }}>
          <li>2025年4月7日に行われたニコニコ動画のランキング変更前のデザインをベースにしています。</li>
          <li>ランキングに載っている動画一覧を俯瞰したい人におすすめです。</li>
          <li>本サイトに広告は一切ありません。</li>
        </ul>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          ランキング動画一覧表示
        </h3>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
          marginBottom: '20px',
        }}>
          <li>毎時0分・30分更新。</li>
          <li>ニコニコ動画のランキング更新時間より遅れる場合があります。</li>
        </ul>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          テーマ切り替え
        </h3>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
          marginBottom: '20px',
        }}>
          <li>サイト右上の設定ボタンから「表示設定」を開いてください。</li>
          <li>ライトモード・ダークモード・ダークブルーの3テーマに対応しています。</li>
        </ul>

        <h3 style={{
          fontSize: '1.2rem',
          marginTop: '24px',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          NGフィルター機能
        </h3>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
          marginBottom: '20px',
        }}>
          <li>明確に「荒らし」と判定される動画は、管理者側で常にフィルタリングしています。要望がある場合はお問い合わせください。</li>
          <li>サイト右上の設定ボタンから「NGリスト管理」を開いてください。</li>
          <li>ここから見たくない動画をブロックすると、ランキングからその動画が消えるようになり、順位もそれに合わせて変更されます。</li>
        </ul>
      </section>

    </div>
  )
}