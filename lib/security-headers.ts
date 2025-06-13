// Security headers configuration
export function getSecurityHeaders(nonce?: string) {
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''} https://*.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'", // CSS-in-JSのため一時的に許可
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
    "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; ')

  return {
    'Content-Security-Policy': cspDirectives,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  }
}

// Generate a cryptographically secure nonce
export function generateNonce(): string {
  const array = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for Node.js
    const nodeCrypto = require('crypto')
    nodeCrypto.randomFillSync(array)
  }
  return Buffer.from(array).toString('base64')
}