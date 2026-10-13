// 最近の検索・保存した検索を書き換えたことを、同じタブの画面へ知らせる（統合バックアップの取り込みなど、
// 検索ページの外で書いたときにも一覧を最新にするため）。ほかのタブの書き換えはブラウザの storage イベントで届く
export const SEARCH_LIBRARY_CHANGE_EVENT = 'nicoran:search-library-change'

export function announceSearchLibraryChange(key: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<string>(SEARCH_LIBRARY_CHANGE_EVENT, { detail: key }),
  )
}
