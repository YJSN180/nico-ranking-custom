/**
 * /api/ranking で返すランキングの名前（タイトル・投稿者名・タグ・人気タグ）の文字参照を戻す。
 * パイプラインが取得元で 1 回だけ戻してから公開した世代は metadata.namesDecoded: true を持つので、ここでは戻さない。
 * もう一度戻すと、chage&amp;aska のように文字参照に見える文字を名前に含む実在のタグやタイトルが変わる。
 * 印のない古い世代（ロールバックで配信されうる）は、パイプラインと同じ戻し方（lib/html-entities）で 1 回だけ戻す
 */

import { decodeHtmlEntities } from '../../lib/html-entities'

type JsonRecord = Record<string, unknown>
type NameDecoder = (value: unknown) => unknown

// パフォーマンス最適化: 最大1000件に制限
const MAX_ITEMS = 1000

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 文字列だけを 1 回戻す。数値や null などはそのまま
function decodeName(value: unknown): unknown {
  return typeof value === 'string' ? decodeHtmlEntities(value) : value
}

function keepName(value: unknown): unknown {
  return value
}

/** パイプラインが名前を取得元で戻してから公開したデータか（true のときだけ。'true' や 1 は印とみなさない） */
export function hasDecodedNames(data: unknown): boolean {
  return (
    isRecord(data) &&
    isRecord(data.metadata) &&
    data.metadata.namesDecoded === true
  )
}

function decodeRankingItem(item: unknown): unknown {
  if (!isRecord(item)) return item
  return {
    ...item,
    title: decodeName(item.title),
    authorName: decodeName(item.authorName),
    description: decodeName(item.description),
    tags: Array.isArray(item.tags) ? item.tags.map(decodeName) : item.tags,
  }
}

// タグがオブジェクト形式 {"0": "東", "1": "方"} の場合は、キーを数値順に並べて値をつなぎ文字列にする
function normalizePopularTag(tag: unknown, decode: NameDecoder): unknown {
  if (!isRecord(tag)) return decode(tag)
  const keys = Object.keys(tag).sort((a, b) => parseInt(a) - parseInt(b))
  return decode(keys.map((key) => tag[key]).join(''))
}

/**
 * ランキングデータを配信する形にする（最大1000件）。
 * 名前は印がなければ 1 回だけ戻し、印があればそのまま返す。件数の上限と人気タグの形の直しはどちらにも行う
 */
export function decodeRankingData(data: unknown): unknown {
  if (!isRecord(data)) return data

  const namesDecoded = hasDecodedNames(data)
  const decode = namesDecoded ? keepName : decodeName
  const items = Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS) : []

  return {
    ...data,
    items: namesDecoded ? items : items.map(decodeRankingItem),
    popularTags: Array.isArray(data.popularTags)
      ? data.popularTags.map((tag) => normalizePopularTag(tag, decode))
      : [],
  }
}
