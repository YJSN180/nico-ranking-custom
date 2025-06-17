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
      <h1 style={{ 
        color: 'var(--text-primary)', 
        fontSize: '2rem', 
        marginBottom: '24px',
        fontWeight: 'bold'
      }}>
        プライバシーポリシー
      </h1>
      
      <section style={{ marginBottom: '32px' }}>
        <p style={{ marginBottom: '16px' }}>ニコラン(Re:turn)（以下「当サイト」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めています。</p>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px', fontWeight: 'bold' }}>1. 収集する情報</h2>
        <p style={{ marginBottom: '12px' }}>当サイトは、以下の情報を収集する場合があります：</p>
        <ul style={{ listStyle: 'disc', paddingLeft: '24px', marginBottom: '16px' }}>
          <li>アクセスログ（IPアドレス、ブラウザ情報、アクセス日時等）</li>
          <li>ユーザーが設定したNGリスト（ブラウザのローカルストレージに保存）</li>
          <li>表示設定（テーマ、表示件数等）</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px', fontWeight: 'bold' }}>2. 情報の利用目的</h2>
        <p style={{ marginBottom: '12px' }}>収集した情報は、以下の目的で利用します：</p>
        <ul style={{ listStyle: 'disc', paddingLeft: '24px', marginBottom: '16px' }}>
          <li>サービスの提供・改善</li>
          <li>セキュリティの向上</li>
          <li>不正アクセスの防止</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px', fontWeight: 'bold' }}>3. 情報の第三者提供</h2>
        <p style={{ marginBottom: '16px' }}>当サイトは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。</p>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px', fontWeight: 'bold' }}>4. Cookie・ローカルストレージの使用</h2>
        <p style={{ marginBottom: '12px' }}>当サイトは、ユーザー体験の向上のため、以下の情報をブラウザに保存します：</p>
        <ul style={{ listStyle: 'disc', paddingLeft: '24px', marginBottom: '16px' }}>
          <li>表示設定（テーマ、ジャンル、期間）</li>
          <li>NGリスト設定</li>
          <li>セッション情報（管理画面アクセス時）</li>
        </ul>
      </section>
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1.5rem', marginBottom: '16px', fontWeight: 'bold' }}>5. 外部サービスとの連携</h2>
        <p style={{ marginBottom: '16px' }}>当サイトは、ニコニコ動画のコンテンツを表示していますが、ニコニコ動画への個人情報の送信は行いません。</p>
      </section>
      
      <p style={{ marginTop: '40px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        最終更新日: 2025年6月17日
      </p>

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
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none'
          }}
        >
          ← トップページに戻る
        </Link>
      </div>
    </div>
  )
}