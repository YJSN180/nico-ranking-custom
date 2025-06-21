#!/usr/bin/env node

// Trace the NG list update flow

console.log('=== NG List Update Flow Analysis ===');

console.log('\n1. When "適用" button is clicked in settings modal:');
console.log('   handleApply() is called');
console.log('   └─> saveNGListDirectly(tempNGList)');

console.log('\n2. In use-user-ng-list.ts, saveNGListDirectly does:');
console.log('   a) Creates updatedList with new timestamp:');
console.log('      const updatedList = {');
console.log('        ...newList,');
console.log('        updatedAt: new Date().toISOString(),  // NEW timestamp');
console.log('        totalCount: recalculateTotalCount(newList)');
console.log('      }');
console.log('   b) setNGList(updatedList)  // Updates React state');
console.log('   c) Saves to localStorage');
console.log('   d) Dispatches ngListUpdated event');

console.log('\n3. The ngListUpdated event listener (same hook):');
console.log('   handleNGListUpdated receives event');
console.log('   └─> setNGList(e.detail.ngList)  // Updates state AGAIN');

console.log('\n4. filterItems useCallback dependencies:');
console.log('   [ngList.videoIds, ngList.videoTitles, ngList.authorIds, ngList.authorNames, ngList.updatedAt]');
console.log('   Since ngList.updatedAt changes, filterItems should get new reference');

console.log('\n5. displayItems useMemo dependencies:');
console.log('   [itemsWithTags, config.tag, filterItems, ngList]');
console.log('   Both filterItems and ngList should trigger recalculation');

console.log('\n⚠️  POTENTIAL ISSUE FOUND:');
console.log('   The ngListUpdated event causes setNGList to be called TWICE:');
console.log('   1. First in saveNGListDirectly');
console.log('   2. Then in the event listener (same component)');
console.log('   This might cause React to batch updates incorrectly');

console.log('\n🔧 SOLUTION:');
console.log('   The event listener should check if it\'s the same component:');
console.log('   - Either skip the event if it originated from the same component');
console.log('   - Or remove the redundant setNGList in saveNGListDirectly');

console.log('\n📊 VERIFICATION:');
console.log('   Need to add console.log in:');
console.log('   - saveNGListDirectly (before setNGList)');
console.log('   - handleNGListUpdated (when event received)');
console.log('   - displayItems useMemo (to see when it recalculates)');