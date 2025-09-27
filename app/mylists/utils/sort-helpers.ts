import type { MylistSortOrder, MylistSortConfig } from '@/lib/storage/types'
import type { MylistManager } from '@/lib/storage/mylists'

export const MYLIST_SORT_OPTIONS: Array<{ value: MylistSortOrder; label: string }> = [
  { value: 'updatedAt-desc', label: '更新日（新しい順）' },
  { value: 'updatedAt-asc', label: '更新日（古い順）' },
  { value: 'createdAt-desc', label: '作成日（新しい順）' },
  { value: 'createdAt-asc', label: '作成日（古い順）' },
  { value: 'name-asc', label: '名前（昇順）' },
  { value: 'name-desc', label: '名前（降順）' },
  { value: 'videoCount-desc', label: '動画数（多い順）' },
  { value: 'videoCount-asc', label: '動画数（少ない順）' }
]

interface UpdateMylistSortParams {
  newSortOrder: MylistSortOrder
  setSortOrder: (order: MylistSortOrder) => void
  mylistManager: Pick<MylistManager, 'saveMylistSortConfig'>
  loadMylists: (order: MylistSortOrder) => Promise<void> | void
  logger?: (message: string, error: unknown) => void
}

export async function updateMylistSort({
  newSortOrder,
  setSortOrder,
  mylistManager,
  loadMylists,
  logger = console.error
}: UpdateMylistSortParams) {
  setSortOrder(newSortOrder)

  try {
    await mylistManager.saveMylistSortConfig({ order: newSortOrder })
  } catch (error) {
    logger('Failed to update sort order:', error)
  }

  await loadMylists(newSortOrder)
}

interface RestoreSavedSortParams {
  mylistManager: Pick<MylistManager, 'getMylistSortConfig'>
  setSortOrder: (order: MylistSortOrder) => void
  loadMylists: (order: MylistSortOrder) => Promise<void> | void
  fallbackOrder: MylistSortOrder
  logger?: (message: string, error: unknown) => void
}

export async function restoreSavedSortOrder({
  mylistManager,
  setSortOrder,
  loadMylists,
  fallbackOrder,
  logger = console.error
}: RestoreSavedSortParams) {
  let savedConfig: MylistSortConfig | null = null

  try {
    savedConfig = await mylistManager.getMylistSortConfig()
  } catch (error) {
    logger('Failed to load mylist sort config:', error)
  }

  const orderToUse = savedConfig?.order ?? fallbackOrder
  setSortOrder(orderToUse)
  await loadMylists(orderToUse)
}
