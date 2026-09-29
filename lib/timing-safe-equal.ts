// 秘密の値（Basic 認証の資格情報など）の比較。
// 文字列の === は最初に異なる位置で打ち切るため、応答時間から一致した長さが漏れうる。
// 両方を SHA-256 にしてから固定長（32 バイト）を最後まで比べるので、中身や長さの違いが比較の時間に出ない。
// middleware（Edge のランタイム）でも動くよう Web Crypto を使う

const encoder = new TextEncoder()

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)])
  let difference = 0
  for (let i = 0; i < digestA.length; i++) {
    difference |= digestA[i] ^ digestB[i]
  }
  return difference === 0
}
