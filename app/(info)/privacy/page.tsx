import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'

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
      
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{
          fontSize: '1.5rem',
          marginBottom: '16px',
          color: 'var(--text-primary)',
          fontWeight: 'bold'
        }}>
          収集・利用する情報
        </h2>
        <ul style={{
          listStyle: 'disc',
          paddingLeft: '20px',
          color: 'var(--text-secondary)',
          lineHeight: '1.8',
          marginBottom: '16px'
        }}>
          <li>アクセスログ（サービス改善・セキュリティ向上のため）</li>
          <li>ユーザー設定（NGリスト、表示設定等をブラウザに保存）</li>
          <li>Cookie（設定の保持、管理画面セッション管理）</li>
        </ul>
        <p style={{
          lineHeight: '1.8',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem'
        }}>
          ※個人情報の収集・ユーザー登録は行いません。
        </p>
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
        最終更新日: 2025年7月2日
      </p>
    </div>
  )
}