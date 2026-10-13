/** Short-lived, request-bound gateway proof. The shared secret never leaves either runtime. */
export const SEARCH_GRANT_HEADER = 'x-search-grant'
const encoder = new TextEncoder()
const payload = (request: Request, timestamp: string): Uint8Array => {
  const url = new URL(request.url)
  return encoder.encode(
    `search-v1\n${timestamp}\n${request.method}\n${url.pathname}${url.search}`,
  )
}
async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
export async function signSearchGrant(
  request: Request,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const timestamp = String(Math.floor(now / 1000))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    payload(request, timestamp),
  )
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${timestamp}.${hex}`
}
export async function verifySearchGrant(
  request: Request,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const grant = request.headers.get(SEARCH_GRANT_HEADER) ?? ''
  const match = /^(\d{10})\.([0-9a-f]{64})$/.exec(grant)
  if (!match || !secret) return false
  const age = Math.floor(now / 1000) - Number(match[1])
  if (age < -5 || age > 30) return false
  const signature = Uint8Array.from(match[2].match(/../g)!, (byte) =>
    parseInt(byte, 16),
  )
  return crypto.subtle.verify(
    'HMAC',
    await key(secret),
    signature,
    payload(request, match[1]),
  )
}
