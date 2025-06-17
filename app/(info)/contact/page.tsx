import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'お問い合わせ | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)への要望・バグ報告・お問い合わせ',
  openGraph: {
    title: 'お問い合わせ | ニコラン(Re:turn)',
    description: 'ニコラン(Re:turn)への要望・バグ報告・お問い合わせ',
  },
}

export default function ContactPage() {
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
        marginBottom: '24px',
        color: 'var(--text-primary)',
        fontWeight: 'bold',
      }}>
        お問い合わせ
      </h1>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          フィードバック・バグ報告
        </h2>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          ニコラン(Re:turn)に関するご意見・ご要望・バグ報告は、GitHubリポジトリのIssueまたはDiscussionsにてお寄せください。
        </p>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <a
            href="https://github.com/YJSN180/nico-ranking-custom/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                GitHub Issues
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                バグ報告・不具合の報告はこちら
              </div>
            </div>
          </a>

          <a
            href="https://github.com/YJSN180/nico-ranking-custom/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                GitHub Discussions
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                機能リクエスト・アイデアの共有はこちら
              </div>
            </div>
          </a>
        </div>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          開発・貢献
        </h2>
        <p style={{
          lineHeight: '1.8',
          marginBottom: '20px',
          color: 'var(--text-secondary)',
        }}>
          ニコラン(Re:turn)はオープンソースプロジェクトです。プルリクエストによる貢献を歓迎します。
        </p>
        
        <a
          href="https://github.com/YJSN180/nico-ranking-custom"
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}
        >
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              GitHub Repository
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              ソースコード・開発への参加
            </div>
          </div>
        </a>
      </section>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          注意事項
        </h2>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
        }}>
          <li>このサイトはニコニコ動画の公式サービスではありません</li>
          <li>動画の著作権は各投稿者に帰属します</li>
          <li>ランキングデータはニコニコ動画から取得しています</li>
          <li>サービスの改善のため、予告なく仕様を変更する場合があります</li>
        </ul>
      </section>

      <section style={{
        padding: '24px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{
          fontSize: '1.2rem',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          よくある質問
        </h3>
        <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong>Q: ランキングはどのくらいの頻度で更新されますか？</strong><br />
            A: 10分ごとに自動更新されます。
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>Q: 特定の動画が表示されません</strong><br />
            A: NGフィルターが適用されている可能性があります。設定から確認してください。
          </p>
          <p>
            <strong>Q: モバイルで正しく表示されません</strong><br />
            A: 最新のブラウザをご利用ください。問題が続く場合はIssueで報告をお願いします。
          </p>
        </div>
      </section>

    </div>
  )
}