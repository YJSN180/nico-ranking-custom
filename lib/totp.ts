import crypto from 'crypto'

// TOTP (Time-based One-Time Password) implementation for MFA
export class TOTP {
  private static readonly DIGITS = 6
  private static readonly PERIOD = 30 // seconds
  private static readonly WINDOW = 1 // Accept codes from ±1 window
  
  // Generate a base32 secret key
  static generateSecret(): string {
    const buffer = crypto.randomBytes(20)
    return this.base32Encode(buffer)
  }
  
  // Generate TOTP code
  static generate(secret: string, time?: number): string {
    const decodedSecret = this.base32Decode(secret)
    const counter = Math.floor((time || Date.now() / 1000) / this.PERIOD)
    
    // Create counter buffer (8 bytes, big-endian)
    const counterBuffer = Buffer.alloc(8)
    counterBuffer.writeBigInt64BE(BigInt(counter))
    
    // Generate HMAC
    const hmac = crypto.createHmac('sha1', decodedSecret)
    hmac.update(counterBuffer)
    const hash = hmac.digest()
    
    // Dynamic truncation
    const offset = hash[hash.length - 1]! & 0x0f
    const binary = 
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff)
    
    const otp = binary % Math.pow(10, this.DIGITS)
    return otp.toString().padStart(this.DIGITS, '0')
  }
  
  // Verify TOTP code with time window
  static verify(secret: string, token: string, time?: number): boolean {
    const currentTime = time || Date.now() / 1000
    
    // Check current window and adjacent windows
    for (let i = -this.WINDOW; i <= this.WINDOW; i++) {
      const windowTime = currentTime + (i * this.PERIOD)
      const expectedToken = this.generate(secret, windowTime)
      
      if (expectedToken === token) {
        return true
      }
    }
    
    return false
  }
  
  // Generate QR code URI for authenticator apps
  static generateQRCodeURI(secret: string, accountName: string, issuer: string): string {
    const encodedIssuer = encodeURIComponent(issuer)
    const encodedAccount = encodeURIComponent(accountName)
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&digits=${this.DIGITS}&period=${this.PERIOD}`
  }
  
  // Base32 encoding (RFC 4648)
  private static base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let result = ''
    let bits = 0
    let value = 0
    
    for (const byte of buffer) {
      value = (value << 8) | byte
      bits += 8
      
      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    
    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31]
    }
    
    return result
  }
  
  // Base32 decoding
  private static base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const buffer: number[] = []
    let bits = 0
    let value = 0
    
    for (const char of encoded.toUpperCase()) {
      const index = alphabet.indexOf(char)
      if (index === -1) continue
      
      value = (value << 5) | index
      bits += 5
      
      if (bits >= 8) {
        buffer.push((value >>> (bits - 8)) & 255)
        bits -= 8
      }
    }
    
    return Buffer.from(buffer)
  }
}