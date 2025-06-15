'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupMFAPage() {
  const router = useRouter()
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  // Generate QR code
  const generateQRCode = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/mfa/setup', {
        method: 'POST',
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate MFA secret')
      }
      
      const data = await response.json()
      setSecret(data.secret)
      
      // Generate QR code
      const QRCode = await import('qrcode')
      const qrCodeURL = await QRCode.toDataURL(data.qrCodeURI)
      setQrCodeDataURL(qrCodeURL)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }
  
  // Verify and enable MFA
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/admin/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, code: verificationCode }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Verification failed')
      }
      
      router.push('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証コードが正しくありません')
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background-color)',
      padding: '40px 20px'
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        background: 'var(--surface-color)',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: 'var(--shadow-md)'
      }}>
        <h1 style={{
          fontSize: '2rem',
          marginBottom: '32px',
          color: 'var(--text-primary)'
        }}>
          二要素認証（MFA）の設定
        </h1>
        
        {!qrCodeDataURL ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{
              marginBottom: '24px',
              color: 'var(--text-secondary)',
              lineHeight: '1.6'
            }}>
              二要素認証を設定すると、管理画面へのアクセス時に
              追加の認証コードが必要になります。
            </p>
            <button
              onClick={generateQRCode}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                fontSize: '1rem',
                background: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? '生成中...' : 'QRコードを生成'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <img
                src={qrCodeDataURL}
                alt="MFA QR Code"
                style={{
                  maxWidth: '300px',
                  margin: '0 auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '16px',
                  background: 'white'
                }}
              />
            </div>
            
            <div style={{
              background: 'var(--surface-secondary)',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <p style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                marginBottom: '8px'
              }}>
                手動でセットアップする場合のシークレットキー:
              </p>
              <code style={{
                display: 'block',
                padding: '8px',
                background: 'var(--background-color)',
                borderRadius: '4px',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
                userSelect: 'all'
              }}>
                {secret}
              </code>
            </div>
            
            <form onSubmit={handleVerify}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}>
                認証アプリに表示された6桁のコードを入力:
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '1.25rem',
                  textAlign: 'center',
                  letterSpacing: '0.5em',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}
              />
              
              {error && (
                <div style={{
                  color: 'var(--error-color)',
                  marginBottom: '16px',
                  fontSize: '0.9rem'
                }}>
                  {error}
                </div>
              )}
              
              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '1rem',
                  background: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isLoading || verificationCode.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: isLoading || verificationCode.length !== 6 ? 0.7 : 1
                }}
              >
                {isLoading ? '確認中...' : '確認して有効化'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}