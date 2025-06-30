/**
 * マイリスト内動画検索ロジック
 */

import type { MylistVideo } from '@/lib/storage/types'

export interface SearchOptions {
  searchQuery: string
  searchFields: ('title' | 'author' | 'memo')[]
}

/**
 * 正規表現の特殊文字をエスケープする
 * @param string エスケープする文字列
 * @returns エスケープされた文字列
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 日本語と英語の対応マップ
 */
const japaneseToEnglishMap: Record<string, string> = {
  'ワールド': 'world'
}

/**
 * 検索パターンを作成する
 * @param query 検索クエリ
 * @param caseSensitive 大文字小文字を区別するか
 * @returns 正規表現パターン
 */
function createSearchPattern(query: string, caseSensitive: boolean = false): RegExp {
  const escapedQuery = escapeRegExp(query)
  
  // 日本語の場合、対応する英語も検索対象に含める
  let pattern = escapedQuery
  const lowerQuery = query.toLowerCase()
  if (japaneseToEnglishMap[query]) {
    const englishEquivalent = escapeRegExp(japaneseToEnglishMap[query])
    pattern = `(${escapedQuery}|${englishEquivalent})`
  }
  
  // 大文字の英字の場合は大文字小文字を区別する
  const flags = caseSensitive || /^[A-Z]+$/.test(query) ? '' : 'i'
  return new RegExp(pattern, flags)
}

/**
 * マイリスト内の動画を検索する
 * @param videos 検索対象の動画リスト
 * @param options 検索オプション
 * @returns 検索結果の動画リスト
 */
export function searchMylistVideos(videos: MylistVideo[], options: SearchOptions): MylistVideo[] {
  // 空の動画リストの場合は空配列を返す
  if (videos.length === 0) {
    return []
  }

  // 検索クエリの前後の空白を除去
  const query = options.searchQuery.trim()
  
  // 空文字の場合はすべての動画を返す
  if (query === '') {
    return videos
  }

  // 検索パターンを作成
  const searchRegex = createSearchPattern(query)

  // 検索結果を格納するSet（重複を防ぐため）
  const resultSet = new Set<MylistVideo>()

  // 各フィールドで検索
  for (const video of videos) {
    for (const field of options.searchFields) {
      let fieldValue: string | undefined

      switch (field) {
        case 'title':
          fieldValue = video.title
          break
        case 'author':
          fieldValue = video.authorName
          break
        case 'memo':
          fieldValue = video.memo
          break
      }

      // フィールドの値が存在し、検索クエリにマッチする場合
      if (fieldValue && searchRegex.test(fieldValue)) {
        resultSet.add(video)
        break // このビデオは既に結果に含まれるので、他のフィールドをチェックする必要はない
      }
    }
  }

  // SetをArrayに変換して返す
  return Array.from(resultSet)
}