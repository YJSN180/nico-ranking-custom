/**
 * Tag Autocomplete Worker
 * タグ自動補完API - KVベースの高速検索実装
 * Trie構造インデックスによるプレフィックス検索
 */

export interface Env {
  TAG_INDEX: KVNamespace
  TAG_DATA: KVNamespace
}

interface TagEntry {
  tag: string
  count: number
  lastSeen: string
}

interface TagIndexNode {
  prefix: string
  tags: string[] // このプレフィックスにマッチするタグのリスト（上位N件）
  children?: string[] // 子ノードのプレフィックスリスト
}

function createCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=300, s-maxage=3600'
  }
}

/**
 * ひらがな・カタカナ・漢字・英数字を正規化
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    // 全角英数字を半角に
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // カタカナをひらがなに（オプション）
    // .replace(/[\u30A1-\u30F6]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60))
}

/**
 * タグのスコアリング
 */
function scoreTag(tag: string, query: string): number {
  const normalizedTag = normalizeQuery(tag)
  const normalizedQuery = normalizeQuery(query)

  // 完全一致
  if (normalizedTag === normalizedQuery) return 1000

  // 前方一致
  if (normalizedTag.startsWith(normalizedQuery)) return 500

  // 含む
  if (normalizedTag.includes(normalizedQuery)) return 100

  // 部分一致（各単語）
  const queryWords = normalizedQuery.split(/[\s_\-]/)
  const tagWords = normalizedTag.split(/[\s_\-]/)
  let wordMatchScore = 0

  for (const qWord of queryWords) {
    for (const tWord of tagWords) {
      if (tWord.startsWith(qWord)) {
        wordMatchScore += 50
      } else if (tWord.includes(qWord)) {
        wordMatchScore += 10
      }
    }
  }

  return wordMatchScore
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // OPTIONS request handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCORSHeaders()
      })
    }

    // クエリパラメータ取得
    const query = url.searchParams.get('q') || ''
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50)
    const genre = url.searchParams.get('genre') // オプション：ジャンル別タグ

    // 最小クエリ長チェック
    if (query.length < 2) {
      return new Response(JSON.stringify({
        suggestions: [],
        query,
        message: 'Query too short'
      }), {
        status: 200,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    const normalizedQuery = normalizeQuery(query)
    console.log(`[Tag Autocomplete] Query: "${query}" -> "${normalizedQuery}"`)

    try {
      // KVからインデックスを取得
      const indexKey = genre ? `index:${genre}:${normalizedQuery.slice(0, 2)}` : `index:${normalizedQuery.slice(0, 2)}`
      const indexData = await env.TAG_INDEX.get(indexKey, 'json') as TagIndexNode | null

      let candidates: string[] = []

      if (indexData) {
        // インデックスから候補を取得
        candidates = indexData.tags || []

        // より詳細なプレフィックスがある場合は子ノードもチェック
        if (normalizedQuery.length > 2 && indexData.children) {
          for (const childPrefix of indexData.children) {
            if (normalizedQuery.startsWith(childPrefix)) {
              const childKey = genre ? `index:${genre}:${childPrefix}` : `index:${childPrefix}`
              const childData = await env.TAG_INDEX.get(childKey, 'json') as TagIndexNode | null
              if (childData && childData.tags) {
                candidates = [...candidates, ...childData.tags]
              }
              break
            }
          }
        }
      } else {
        // インデックスがない場合は全タグから検索（フォールバック）
        const allTagsKey = genre ? `tags:${genre}` : 'tags:all'
        const allTagsData = await env.TAG_DATA.get(allTagsKey, 'json') as string[] | null

        if (allTagsData) {
          candidates = allTagsData
        }
      }

      // スコアリングとフィルタリング
      const scoredTags = candidates
        .map(tag => ({
          tag,
          score: scoreTag(tag, query)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.tag)

      // タグの詳細情報を取得（オプション）
      const withDetails = url.searchParams.get('details') === 'true'
      let suggestions = scoredTags

      if (withDetails) {
        const detailPromises = scoredTags.map(async tag => {
          const details = await env.TAG_DATA.get(`tag:${tag}`, 'json') as TagEntry | null
          return details || { tag, count: 0, lastSeen: '' }
        })
        suggestions = await Promise.all(detailPromises) as any
      }

      return new Response(JSON.stringify({
        suggestions,
        query,
        normalized: normalizedQuery,
        total: scoredTags.length
      }), {
        status: 200,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json',
          'X-Cache-Status': indexData ? 'INDEX_HIT' : 'FULL_SCAN'
        }
      })
    } catch (error) {
      console.error('[Tag Autocomplete] Error:', error)
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }
  }
}