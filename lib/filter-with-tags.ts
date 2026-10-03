import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList, TagNGList } from '@/types/ng-list-extended'
import {
  isSameTagName,
  tagNameFormsIgnoringCase,
  tagNameIncludes,
  type TagNameForms,
} from './tag-name-match'

// 比べる形にした NG の語（大文字小文字を区別しない）
interface PreparedMatchLists {
  exact: TagNameForms[]
  partial: TagNameForms[]
}

/** タグ NG リストを比べる形にしたもの。動画ごとに作り直さないよう、絞り込みの前に 1 回だけ作る */
export interface PreparedTagNGList {
  locked: PreparedMatchLists
  user: PreparedMatchLists
  both: PreparedMatchLists
}

function prepareMatchLists(lists: TagNGList['locked']): PreparedMatchLists {
  return {
    exact: lists.exact.map((tag) => tagNameFormsIgnoringCase(tag)),
    partial: lists.partial.map((tag) => tagNameFormsIgnoringCase(tag)),
  }
}

export function prepareTagNGList(ngTags: TagNGList): PreparedTagNGList {
  return {
    locked: prepareMatchLists(ngTags.locked),
    user: prepareMatchLists(ngTags.user),
    both: prepareMatchLists(ngTags.both),
  }
}

// 完全一致・部分一致のどちらかに当たるか
function matchesLists(tag: TagNameForms, lists: PreparedMatchLists): boolean {
  return (
    lists.exact.some((exact) => isSameTagName(exact, tag)) ||
    lists.partial.some((partial) => tagNameIncludes(tag, partial))
  )
}

/**
 * 比べる形にしたタグ NG リストに当たるか。
 * 保存した語と動画のタグ名は、どちらか一方が文字参照のまま（&amp; など）でも一致させる
 */
export function matchesTagNGList(
  item: RankingItem,
  ngTags: PreparedTagNGList,
): boolean {
  // アイテムにタグ情報がない場合はフィルタリングしない
  if (!item.tagDetails || item.tagDetails.length === 0) {
    return false
  }

  for (const tagDetail of item.tagDetails) {
    const tag = tagNameFormsIgnoringCase(tagDetail.name)
    // ロックタグはロック用、それ以外はユーザー用の NG に当てる
    if (matchesLists(tag, tagDetail.isLocked ? ngTags.locked : ngTags.user)) {
      return true
    }
    // 両方（ロック・ユーザー問わず）の NG
    if (matchesLists(tag, ngTags.both)) {
      return true
    }
  }

  // どのNGタグにも該当しない場合
  return false
}

/**
 * タグによるフィルタリング
 * @param item ランキングアイテム
 * @param ngTags タグNGリスト
 * @returns NGリストに該当する場合はtrue
 */
export function filterByTags(
  item: RankingItem,
  ngTags: ExtendedNGList['tags'],
): boolean {
  // タグNGリストが未定義、またはアイテムにタグ情報がない場合はフィルタリングしない
  if (!ngTags || !item.tagDetails || item.tagDetails.length === 0) {
    return false
  }
  return matchesTagNGList(item, prepareTagNGList(ngTags))
}
