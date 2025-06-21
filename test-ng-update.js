#!/usr/bin/env node

// Test script to verify NG list update behavior

// Simulate the displayItems useMemo logic
function recalculateRanks(items, ngVideoIds) {
  console.log('Input items:', items.map(i => `${i.id}(rank:${i.rank})`).join(', '));
  console.log('NG video IDs:', ngVideoIds);
  
  const result = [];
  let displayRank = 1;
  
  for (const item of items) {
    if (!ngVideoIds.includes(item.id)) {
      result.push({
        ...item,
        originalRank: item.rank,
        rank: displayRank++
      });
    }
  }
  
  console.log('Output items:', result.map(i => `${i.id}(rank:${i.rank}, was:${i.originalRank})`).join(', '));
  return result;
}

// Test data
const initialItems = [
  { id: 'sm1', rank: 1, title: 'Video 1' },
  { id: 'sm2', rank: 2, title: 'Video 2' },
  { id: 'sm3', rank: 3, title: 'Video 3' },
  { id: 'sm4', rank: 4, title: 'Video 4' },
  { id: 'sm5', rank: 5, title: 'Video 5' },
];

console.log('=== Initial state (no NG) ===');
let displayItems = recalculateRanks(initialItems, []);

console.log('\n=== After adding sm2 and sm4 to NG list ===');
displayItems = recalculateRanks(initialItems, ['sm2', 'sm4']);

console.log('\n=== Expected result ===');
console.log('sm1(rank:1, was:1), sm3(rank:2, was:3), sm5(rank:3, was:5)');

console.log('\n=== What might be happening (if ranks are not recalculated) ===');
console.log('If displayItems is not recalculated, you would see:');
console.log('sm1(rank:1), sm3(rank:3), sm5(rank:5) - ranks remain as original');