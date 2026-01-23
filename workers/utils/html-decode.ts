/**
 * HTMLエンティティをデコードするユーティリティ関数
 * ニコニコ動画APIから取得したテキストに含まれる
 * HTMLエンティティを元の文字に変換する
 */

import type { RankingItem, RankingData } from '../../types/ranking'

/**
 * 基本的なHTMLエンティティをデコード
 * @param text デコード対象のテキスト
 * @returns デコード済みのテキスト
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text
  
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")  // 別形式のアポストロフィ
    .replace(/&#x2F;/g, '/')   // スラッシュ
}

/**
 * ランキングアイテムのHTMLエンティティをデコード
 * @param item ランキングアイテム
 * @returns デコード済みのランキングアイテム
 */
export function decodeRankingItem(item: RankingItem): RankingItem {
  if (!item) return item

  return {
    ...item,
    title: item.title ? decodeHtmlEntities(item.title) : item.title,
    authorName: item.authorName ? decodeHtmlEntities(item.authorName) : item.authorName,
    tags: item.tags ? item.tags.map((tag: string) => decodeHtmlEntities(tag)) : item.tags
  }
}

// タグの型定義（オブジェクト形式または文字列）
type PopularTagInput = string | Record<string, string>

/**
 * ランキングデータ全体のHTMLエンティティをデコード
 * @param data ランキングデータ
 * @returns デコード済みのランキングデータ（最大1000件）
 */
export function decodeRankingData(data: RankingData): RankingData {
  if (!data) return data

  // パフォーマンス最適化: 最大1000件に制限
  const MAX_ITEMS = 1000
  const items = data.items ? data.items.slice(0, MAX_ITEMS) : []

  return {
    ...data,
    items: items.map(decodeRankingItem),
    popularTags: data.popularTags ? data.popularTags.map((tag: PopularTagInput) => {
      // タグがオブジェクト形式 {"0": "東", "1": "方"} の場合、文字列に変換
      if (typeof tag === 'object' && !Array.isArray(tag) && tag !== null) {
        // オブジェクトのキーを数値順にソートして値を結合
        const keys = Object.keys(tag).sort((a, b) => parseInt(a) - parseInt(b))
        const tagString = keys.map(key => tag[key]).join('')
        return decodeHtmlEntities(tagString)
      }
      // 既に文字列の場合はそのままデコード
      return typeof tag === 'string' ? decodeHtmlEntities(tag) : String(tag)
    }) : []
  }
}