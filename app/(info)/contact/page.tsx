import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'

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
        <BackLink />
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
          ニコラン(Re:turn)に関するご意見・ご要望・バグ報告は、管理者のXアカウント(@yjmnsub)にてお寄せください。
        </p>
        
        <a
          href="https://twitter.com/yjmnsub"
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
              @yjmnsub
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              管理者のXアカウント
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
          <li>このサイトはニコニコ動画の公式サービスではありません。</li>
          <li>ランキングデータはニコニコ動画から取得しています。</li>
          <li>サービスの改善のため、予告なく仕様を変更する場合があります。</li>
          <li>ユーザー側のテーマやNGリストの設定は定期的にリセットされる可能性があります。</li>
        </ul>
      </section>

      <section style={{
        padding: '24px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold',
        }}>
          よくある質問
        </h2>
        <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong>Q: ランキングはどのくらいの頻度で更新されますか？</strong><br />
            A: 1時間分ごとに自動更新されます。
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>Q: 特定の動画が表示されません。</strong><br />
            A: 管理者側またはユーザー側でNGフィルターが適用されている可能性があります。管理者側のNG動画は所定のものなので変更できません。ユーザー側のNGフィルターに関しては設定から確認してください。
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>Q: 「例のソレ」動画がないのはなぜですか？</strong><br />
            A: 技術的制約によるものです。
          </p>
          <p>
            <strong>Q: モバイルで正しく表示されません。</strong><br />
            A: 最新のブラウザをご利用ください。問題が続く場合は上のXアカウントで報告をお願いします。
          </p>
        </div>
      </section>

    </div>
  )
}