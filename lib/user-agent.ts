/**
 * サーバーサイドでUser-Agentからモバイルデバイスを判定
 * @param userAgent User-Agent文字列
 * @returns モバイルデバイスの場合はtrue
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) {
    return false
  }

  // モバイルデバイスを示すキーワード
  const mobileKeywords = [
    'Mobile',
    'Android',
    'iPhone',
    'iPad',
    'iPod',
    'BlackBerry',
    'IEMobile',
    'Opera Mini',
    'Windows Phone',
    'webOS'
  ]

  // User-Agentに含まれるキーワードをチェック
  return mobileKeywords.some(keyword => 
    userAgent.includes(keyword)
  )
}

/**
 * Next.jsのheaders()からUser-Agentを取得してモバイル判定
 * @param headers Next.jsのReadonlyHeaders
 * @returns モバイルデバイスの場合はtrue
 */
export function isMobileFromHeaders(headers: { get(name: string): string | null }): boolean {
  const userAgent = headers.get('user-agent')
  return isMobileUserAgent(userAgent)
}