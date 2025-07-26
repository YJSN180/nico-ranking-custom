// IndexedDB版のカスタムランキング順序管理フック
// NOTE: この関数は、メインのuseCustomRankingsフックと連携して使用する必要があります
import { useCustomRankingsOrderIndexedDB } from './use-custom-rankings-order-indexeddb'
import type { CustomRankingWithConditions } from '@/lib/storage/types'

/**
 * カスタムランキング順序管理フック
 * IndexedDB版への移行により、メインフックからの関数が必要
 */
export function useCustomRankingsOrder(
  rankings: CustomRankingWithConditions[],
  updateRankingOrder: (rankingOrders: { id: string; orderIndex: number }[]) => Promise<boolean>,
  toggleVisibility: (id: string) => Promise<boolean>
) {
  return useCustomRankingsOrderIndexedDB({
    rankings,
    updateRankingOrder,
    toggleVisibility
  })
}