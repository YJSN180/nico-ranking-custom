/**
 * HTMLエンティティをデコードするユーティリティ関数
 * ニコニコ動画APIから取得したテキストに含まれる
 * HTMLエンティティを元の文字に変換する
 */

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
export function decodeRankingItem(item: any): any {
  if (!item) return item
  
  return {
    ...item,
    title: item.title ? decodeHtmlEntities(item.title) : item.title,
    authorName: item.authorName ? decodeHtmlEntities(item.authorName) : item.authorName,
    description: item.description ? decodeHtmlEntities(item.description) : item.description,
    tags: item.tags ? item.tags.map((tag: string) => decodeHtmlEntities(tag)) : item.tags
  }
}

/**
 * ランキングデータ全体のHTMLエンティティをデコード
 * @param data ランキングデータ
 * @returns デコード済みのランキングデータ
 */
export function decodeRankingData(data: any): any {
  if (!data) return data
  
  return {
    ...data,
    items: data.items ? data.items.map(decodeRankingItem) : [],
    popularTags: data.popularTags ? data.popularTags.map((tag: any) => ({
      ...tag,
      name: tag.name ? decodeHtmlEntities(tag.name) : tag.name
    })) : []
  }
}