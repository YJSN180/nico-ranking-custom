import { NextResponse } from 'next/server'
import { TOTP } from '@/lib/totp'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    // 管理者認証チェック - CRITICAL SECURITY FIX
    const cookieStore = await cookies()
    const adminAuth = cookieStore.get('admin-auth')
    
    if (!adminAuth || adminAuth.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin authentication required' },
        { status: 401 }
      )
    }
    
    const { secret, code } = await request.json()
    
    if (!secret || !code) {
      return NextResponse.json(
        { error: 'Secret and code are required' },
        { status: 400 }
      )
    }
    
    // Verify the code
    const isValid = TOTP.verify(secret, code)
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      )
    }
    
    // Set MFA enabled cookie - SECURITY FIX: 秘密鍵の平文保存を削除
    // 注意: 本番環境では、MFA秘密鍵は暗号化してデータベースで管理する必要があります
    cookieStore.set('mfa-enabled', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    })
    
    // SECURITY FIX: MFA秘密鍵の平文クッキー保存を削除
    // 本番環境では適切な暗号化とデータベース保存が必要
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}