// OR条件の挙動を詳しくテスト

// 簡略化したフィルタリングロジック
function matchesConditions(item, conditions) {
  const orConditions = conditions.filter(c => c.operator === 'OR')
  const andConditions = conditions.filter(c => c.operator === 'AND')
  
  console.log('\n=== 条件チェック ===')
  console.log('アイテム:', item.title)
  console.log('タグ:', item.tags)
  console.log('OR条件:', orConditions.map(c => `${c.tag} (${c.tagType})`))
  console.log('AND条件:', andConditions.map(c => `${c.tag} (${c.tagType})`))
  
  // AND条件のチェック
  for (const condition of andConditions) {
    const hasTag = item.tags.includes(condition.tag)
    console.log(`AND条件 "${condition.tag}": ${hasTag ? '✅' : '❌'}`)
    if (!hasTag) {
      console.log('→ AND条件を満たさないため除外')
      return false
    }
  }
  
  // OR条件のチェック
  if (orConditions.length > 0) {
    console.log('\nOR条件の評価:')
    let foundAnyOrTag = false
    for (const condition of orConditions) {
      const hasTag = item.tags.includes(condition.tag)
      console.log(`  - "${condition.tag}": ${hasTag ? '✅' : '❌'}`)
      if (hasTag) {
        foundAnyOrTag = true
      }
    }
    
    if (!foundAnyOrTag) {
      console.log('→ OR条件を1つも満たさないため除外')
      return false
    } else {
      console.log('→ OR条件を満たす（少なくとも1つ該当）')
    }
  }
  
  console.log('→ すべての条件を満たす ✅')
  return true
}

// テストケース
const testItems = [
  { title: '動画A', tags: ['ゲーム', '実況'] },
  { title: '動画B', tags: ['ボカロ', '音楽'] },
  { title: '動画C', tags: ['ゲーム', '音楽'] },
  { title: '動画D', tags: ['アニメ', 'MAD'] },
  { title: '動画E', tags: ['実況'] }
]

// ケース1: OR条件のみ
console.log('\n\n===== ケース1: OR条件のみ =====')
console.log('条件: 「ゲーム」OR「ボカロ」OR「アニメ」')
const case1Conditions = [
  { tag: 'ゲーム', operator: 'OR', tagType: 'both' },
  { tag: 'ボカロ', operator: 'OR', tagType: 'both' },
  { tag: 'アニメ', operator: 'OR', tagType: 'both' }
]
const case1Results = testItems.filter(item => matchesConditions(item, case1Conditions))
console.log('\n結果:', case1Results.map(i => i.title))

// ケース2: AND条件 + OR条件
console.log('\n\n===== ケース2: AND条件 + OR条件 =====')
console.log('条件: 「実況」AND（「ゲーム」OR「ボカロ」）')
const case2Conditions = [
  { tag: '実況', operator: 'AND', tagType: 'both' },
  { tag: 'ゲーム', operator: 'OR', tagType: 'both' },
  { tag: 'ボカロ', operator: 'OR', tagType: 'both' }
]
const case2Results = testItems.filter(item => matchesConditions(item, case2Conditions))
console.log('\n結果:', case2Results.map(i => i.title))

// ケース3: ユーザーが混乱しそうなケース
console.log('\n\n===== ケース3: 複数のOR条件（ANDっぽく見える？） =====')
console.log('条件: 「ゲーム」OR「実況」')
const case3Conditions = [
  { tag: 'ゲーム', operator: 'OR', tagType: 'both' },
  { tag: '実況', operator: 'OR', tagType: 'both' }
]
const case3Results = testItems.filter(item => matchesConditions(item, case3Conditions))
console.log('\n結果:', case3Results.map(i => i.title))
console.log('\n期待される結果: ゲームまたは実況を含むすべての動画')
console.log('実際の結果: ゲームまたは実況を含むすべての動画')