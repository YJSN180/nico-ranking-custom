// デバッグ用のコンポーネント（client-page.tsxの修正版）
// displayItemsのuseMemoにログを追加

export const debugDisplayItems = () => {
  console.log('=== NG List Update Debug ===');
  
  // displayItems useMemoの前後にログを追加する例
  const displayItems = useMemo(() => {
    console.log('[displayItems] useMemo recalculating...');
    console.log('[displayItems] Dependencies:', {
      itemsWithTagsLength: itemsWithTags.length,
      configTag: config.tag,
      filterItemsRef: filterItems,
      ngList: {
        videoIds: ngList.videoIds.length,
        updatedAt: ngList.updatedAt
      }
    });
    
    // 既存のロジック...
    const result = [];
    
    console.log('[displayItems] Result:', result.length, 'items');
    return result;
  }, [itemsWithTags, config.tag, filterItems, ngList]);
  
  // filterItems関数もログを追加
  const filterItems = useCallback((items) => {
    console.log('[filterItems] Called with', items.length, 'items');
    console.log('[filterItems] NG List state:', {
      videoIds: ngList.videoIds.length,
      updatedAt: ngList.updatedAt
    });
    
    // フィルタリングロジック...
    const filtered = items.filter(item => {
      // NGチェック
    });
    
    console.log('[filterItems] Filtered to', filtered.length, 'items');
    return filtered;
  }, [ngList.videoIds, ngList.videoTitles, ngList.authorIds, ngList.authorNames, ngList.updatedAt]);
}