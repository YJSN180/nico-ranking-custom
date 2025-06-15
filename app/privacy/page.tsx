import { HeaderWithSettings } from '@/components/header-with-settings'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | ニコニコランキング(Re:turn)',
  description: 'ニコニコランキング(Re:turn)のプライバシーポリシー',
}

export default function PrivacyPage() {
  return (
    <main style={{ 
      padding: '0',
      minHeight: '100vh',
      background: 'var(--background-color)'
    }}>
      <HeaderWithSettings />
      
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto',
        padding: '40px 20px'
      }}>
        <div style={{
          background: 'var(--surface-color)',
          borderRadius: '16px',
          padding: '40px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <h1 style={{ 
            color: 'var(--text-primary)', 
            fontSize: '2rem', 
            marginBottom: '32px',
            borderBottom: '2px solid var(--border-color)',
            paddingBottom: '16px'
          }}>
            プライバシーポリシー
          </h1>
          
          <div style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '1rem', 
            lineHeight: '1.8',
            '& h2': {
              color: 'var(--text-primary)',
              fontSize: '1.5rem',
              marginTop: '32px',
              marginBottom: '16px'
            },
            '& p': {
              marginBottom: '16px'
            }
          } as any}>
            <p>ニコニコランキング(Re:turn)（以下「当サイト」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めています。</p>
            
            <h2>1. 収集する情報</h2>
            <p>当サイトは、以下の情報を収集する場合があります：</p>
            <ul>
              <li>アクセスログ（IPアドレス、ブラウザ情報、アクセス日時等）</li>
              <li>ユーザーが設定したNGリスト（ブラウザのローカルストレージに保存）</li>
              <li>表示設定（テーマ、表示件数等）</li>
            </ul>
            
            <h2>2. 情報の利用目的</h2>
            <p>収集した情報は、以下の目的で利用します：</p>
            <ul>
              <li>サービスの提供・改善</li>
              <li>セキュリティの向上</li>
              <li>不正アクセスの防止</li>
            </ul>
            
            <h2>3. 情報の第三者提供</h2>
            <p>当サイトは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。</p>
            
            <h2>4. Cookie・ローカルストレージの使用</h2>
            <p>当サイトは、ユーザー体験の向上のため、以下の情報をブラウザに保存します：</p>
            <ul>
              <li>表示設定（テーマ、ジャンル、期間）</li>
              <li>NGリスト設定</li>
              <li>セッション情報（管理画面アクセス時）</li>
            </ul>
            
            <h2>5. 外部サービスとの連携</h2>
            <p>当サイトは、ニコニコ動画のコンテンツを表示していますが、ニコニコ動画への個人情報の送信は行いません。</p>
            
            <h2>6. お問い合わせ</h2>
            <p>プライバシーポリシーに関するお問い合わせは、GitHubのIssueよりお願いいたします。</p>
            
            <p style={{ marginTop: '40px', fontSize: '0.9rem' }}>
              最終更新日: 2025年6月15日
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}