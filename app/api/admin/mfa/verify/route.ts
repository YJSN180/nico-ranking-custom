import { NextResponse } from 'next/server'
import { TOTP } from '@/lib/totp'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
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
    
    // Set MFA enabled cookie (in production, store this in database)
    const cookieStore = await cookies()
    cookieStore.set('mfa-enabled', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    })
    
    // Store the secret (in production, encrypt and store in database)
    // For now, we'll store it in an environment variable
    // This is a simplified implementation
    cookieStore.set('mfa-secret', secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/'
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}