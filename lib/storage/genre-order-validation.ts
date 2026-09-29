import type { GenreItem } from '@/types/genre-order'

export const INVALID_GENRE_ORDER_MESSAGE = '無効なジャンルデータが含まれています'

/**
 * ジャンル並び替えとして保存してよい形か（ジャンル並び替えのインポートと同じ条件）。
 * 形の違うデータで保存すると、今の並び順を上書きしたうえで読み込み時に既定へ戻る
 */
export function isValidGenreOrder(value: unknown): value is GenreItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        Boolean(item.id) &&
        'isVisible' in item &&
        typeof item.isVisible === 'boolean' &&
        'order' in item &&
        typeof item.order === 'number'
    )
  )
}
