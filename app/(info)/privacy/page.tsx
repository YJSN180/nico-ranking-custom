import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)のプライバシーポリシー',
}

export default function PrivacyPage() {
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto',
      padding: '20px'
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
        color: 'var(--text-primary)', 
        fontSize: '2rem', 
        marginBottom: '24px',
        fontWeight: 'bold'
      }}>
        プライバシーポリシー
      </h1>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          基本方針
        </h2>
        <p style={{
          lineHeight: '1.8',
          color: 'var(--text-secondary)',
          marginBottom: '16px'
        }}>
          ニコラン(Re:turn)は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。
          本サービスでは、ユーザー登録や個人情報の収集は行いません。
        </p>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          収集する情報
        </h2>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8'
        }}>
          <li>アクセスログ（IPアドレス、ブラウザ情報、アクセス日時等）</li>
          <li>ユーザーが設定したNGリスト（ブラウザのローカルストレージに保存）</li>
          <li>表示設定（テーマ、表示件数等）</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          情報の利用目的
        </h2>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8'
        }}>
          <li>サービスの提供・改善</li>
          <li>セキュリティの向上</li>
          <li>不正アクセスの防止</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          Cookie（クッキー）の使用
        </h2>
        <p style={{
          lineHeight: '1.8',
          color: 'var(--text-secondary)',
          marginBottom: '16px'
        }}>
          本サービスでは、以下の目的でCookieを使用します：
        </p>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8'
        }}>
          <li>表示設定（テーマ、ジャンル、期間）</li>
          <li>NGリスト設定</li>
          <li>セッション情報（管理画面アクセス時）</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          お問い合わせ
        </h2>
        <p style={{
          lineHeight: '1.8',
          color: 'var(--text-secondary)'
        }}>
          プライバシーポリシーに関するお問い合わせは、
          <Link href="/contact" style={{ color: 'var(--link)', textDecoration: 'none' }}>
            お問い合わせページ
          </Link>
          よりご連絡ください。
        </p>
      </section>
      
      <p style={{
        color: 'var(--text-tertiary)',
        fontSize: '0.875rem',
        marginTop: '40px'
      }}>
        最終更新日: 2025年6月17日
      </p>
    </div>
  )
}