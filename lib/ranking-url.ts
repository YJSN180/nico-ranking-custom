import type { RankingConfig } from '@/types/ranking-config'

export function buildRankingConfigUrl(config: RankingConfig): string {
  const params = new URLSearchParams()

  if (config.genre !== 'all') {
    params.set('genre', config.genre)
  }
  if (config.period !== '24h') {
    params.set('period', config.period)
  }
  if (config.tag) {
    params.set('tag', config.tag)
  }

  return params.toString() ? `?${params.toString()}` : '/'
}
