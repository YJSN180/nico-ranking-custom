import { NextResponse } from 'next/server'
import { TOTP } from '@/lib/totp'
import QRCode from 'qrcode'

export async function POST() {
  try {
    // Generate a new secret
    const secret = TOTP.generateSecret()
    
    // Generate QR code URI
    const accountName = process.env.ADMIN_USERNAME || 'admin'
    const issuer = 'ニコラン(Re:turn)'
    const qrCodeURI = TOTP.generateQRCodeURI(secret, accountName, issuer)
    
    // Generate QR code data URL on server side
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeURI, {
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    })
    
    return NextResponse.json({
      secret,
      qrCodeURI,
      qrCodeDataURL,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate MFA secret' },
      { status: 500 }
    )
  }
}