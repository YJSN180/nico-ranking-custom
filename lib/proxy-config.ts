// プロキシ設定のスタブ（将来の実装用）

export function isProxyConfigured(): boolean {
  return false // 現在はプロキシは使用しない
}

export async function scrapeRankingViaProxy(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<any> {
  throw new Error('Proxy scraping not implemented')
}