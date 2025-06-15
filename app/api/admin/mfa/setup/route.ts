import { NextResponse } from 'next/server'
import { TOTP } from '@/lib/totp'

export async function POST() {
  try {
    // Generate a new secret
    const secret = TOTP.generateSecret()
    
    // Generate QR code URI
    const accountName = process.env.ADMIN_USERNAME || 'admin'
    const issuer = 'ニコニコランキング(Re:turn)'
    const qrCodeURI = TOTP.generateQRCodeURI(secret, accountName, issuer)
    
    return NextResponse.json({
      secret,
      qrCodeURI,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate MFA secret' },
      { status: 500 }
    )
  }
}