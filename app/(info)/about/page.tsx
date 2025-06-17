import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'このサイトについて | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)は、ニコニコ動画のランキングを高速に表示するサイトです。人気タグ別ランキング、NGフィルター機能を搭載しています。',
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
        marginBottom: '24px',
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
          ニコラン(Re:turn)は、ニコニコ動画のランキングを高速に表示するためのサイトです。
          最新の技術を活用して、快適なランキング閲覧体験を提供します。
        </p>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          主な特徴
        </h2>
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}>
          {[
            {
              title: '高速表示',
              description: '10分ごとに更新されるキャッシュにより、瞬時にランキングを表示',
            },
            {
              title: '人気タグ別ランキング',
              description: '各ジャンルの人気タグ別にランキングを絞り込み可能',
            },
            {
              title: 'NGフィルター機能',
              description: '見たくない動画や投稿者をブロックして快適に閲覧',
            },
            {
              title: 'リアルタイム統計',
              description: '再生数・コメント数・マイリスト数を1分ごとに自動更新',
            },
            {
              title: 'モバイル対応',
              description: 'スマートフォンでも快適に利用できるレスポンシブデザイン',
            },
            {
              title: 'テーマ切り替え',
              description: 'ライト・ダーク・ダークブルーの3つのテーマから選択可能',
            },
          ].map((feature, index) => (
            <li key={index} style={{
              marginBottom: '20px',
              padding: '16px',
              background: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                marginBottom: '8px',
                color: 'var(--text-primary)',
                fontWeight: 'bold',
              }}>
                {feature.title}
              </h3>
              <p style={{
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
              }}>
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          使い方
        </h2>
        <ol style={{
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
        }}>
          <li style={{ marginBottom: '12px' }}>
            上部のジャンルタブから見たいジャンルを選択
          </li>
          <li style={{ marginBottom: '12px' }}>
            「24時間」または「毎時」の期間を選択
          </li>
          <li style={{ marginBottom: '12px' }}>
            人気タグから特定のタグのランキングを表示（オプション）
          </li>
          <li style={{ marginBottom: '12px' }}>
            動画タイトルをクリックしてニコニコ動画で視聴
          </li>
          <li style={{ marginBottom: '12px' }}>
            右上の設定ボタンからNGリストやテーマを設定
          </li>
        </ol>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          技術仕様
        </h2>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
        }}>
          <li>Next.js 14 (App Router) によるサーバーサイドレンダリング</li>
          <li>Cloudflare Workers + KV による高速キャッシング</li>
          <li>GitHub Actions による10分ごとの自動更新</li>
          <li>TypeScript による型安全な開発</li>
          <li>Vitest/Playwright によるテスト駆動開発</li>
        </ul>
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