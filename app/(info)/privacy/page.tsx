import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | ニコラン(Re:turn)',
  description: 'ニコラン(Re:turn)のプライバシーポリシー - データ収集、Cookie、ローカルストレージ等の取り扱いについて',
}

export default function PrivacyPage() {
  const sectionStyle = { marginBottom: '32px' }
  const h2Style = {
    fontSize: '1.5rem',
    marginBottom: '16px',
    color: 'var(--text-primary)',
    fontWeight: 'bold'
  }
  const h3Style = {
    fontSize: '1.25rem',
    marginBottom: '12px',
    color: 'var(--text-primary)',
    fontWeight: '600'
  }
  const textStyle = {
    lineHeight: '1.8',
    color: 'var(--text-secondary)',
    marginBottom: '16px'
  }
  const listStyle = {
    listStyle: 'disc',
    paddingLeft: '20px',
    color: 'var(--text-secondary)',
    lineHeight: '1.8',
    marginBottom: '16px'
  }
  const noteStyle = {
    backgroundColor: 'var(--background-secondary)',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    marginBottom: '16px'
  }

  return (
    <div style={{ 
      maxWidth: '900px', 
      margin: '0 auto',
      padding: '20px'
    }}>
      <div style={{ marginBottom: '24px' }}>
        <BackLink />
      </div>
      
      <h1 style={{ 
        color: 'var(--text-primary)', 
        fontSize: '2rem', 
        marginBottom: '24px',
        fontWeight: 'bold'
      }}>
        プライバシーポリシー
      </h1>

      <section style={sectionStyle}>
        <h2 style={h2Style}>収集・利用する情報</h2>
        
        <p style={textStyle}>
          当サービスは個人情報の収集やユーザー登録を行いません。以下の情報のみを取り扱います：
        </p>
        
        <ul style={listStyle}>
          <li><strong>ブラウザ内保存データ</strong>: お気に入り動画リスト、非表示設定、ユーザー設定（すべてお客様のブラウザ内のみ）</li>
          <li><strong>基本的なアクセスログ</strong>: サービス改善のためのアクセス統計（個人特定不可）</li>
          <li><strong>Cookie</strong>: ユーザー設定の保持のみ</li>
        </ul>
        
        <p style={textStyle}>
          これらの情報は外部に送信されることはありません。
        </p>
      </section>
      
      <section style={sectionStyle}>
        <h2 style={h2Style}>お問い合わせ</h2>
        <p style={textStyle}>
          プライバシーポリシーに関するお問い合わせは、
          <Link href="/contact" style={{ color: 'var(--link)', textDecoration: 'none' }}>
            お問い合わせページ
          </Link>
          よりご連絡ください。
        </p>
      </section>
      
      <div style={{
        borderTop: '1px solid var(--border-color)',
        paddingTop: '24px',
        marginTop: '48px'
      }}>
        <p style={{
          color: 'var(--text-tertiary)',
          fontSize: '0.875rem',
          marginBottom: '8px'
        }}>
          制定日: 2025年7月2日
        </p>
        <p style={{
          color: 'var(--text-tertiary)',
          fontSize: '0.875rem'
        }}>
          最終更新日: 2025年7月6日
        </p>
      </div>
    </div>
  )
}