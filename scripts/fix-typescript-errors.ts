#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'

// TypeScript エラーの自動修正スクリプト

async function fixTypeScriptErrors() {
  console.log('TypeScript エラーの自動修正を開始します...\n')

  // completeHybridScrapeをfetchRankingに置換
  const filesToFix = await glob('app/api/**/*.ts')
  
  for (const file of filesToFix) {
    let content = readFileSync(file, 'utf-8')
    let modified = false

    // completeHybridScrapeのimportを修正
    if (content.includes("import { completeHybridScrape }")) {
      content = content.replace(
        "import { completeHybridScrape }",
        "import { fetchRanking }"
      )
      modified = true
    }

    // completeHybridScrapeの呼び出しを修正
    if (content.includes('completeHybridScrape(')) {
      content = content.replace(
        /const (\w+) = await completeHybridScrape\(([^,]+), ([^,]+)(?:, ([^)]+))?\)/g,
        (match, varName, genre, term, tag) => {
          if (tag) {
            return `const rankingData = await fetchRanking(${genre}, ${tag} || null, ${term})
    const ${varName} = {
      items: rankingData.items,
      popularTags: rankingData.popularTags
    }`
          } else {
            return `const rankingData = await fetchRanking(${genre}, null, ${term})
    const ${varName} = {
      items: rankingData.items,
      popularTags: rankingData.popularTags
    }`
          }
        }
      )
      modified = true
    }

    // 型注釈のないfilterやmapに型を追加
    if (content.includes('.filter(item =>') || content.includes('.filter((item)')) {
      content = content.replace(
        /\.filter\(\s*\(?item\)?\s*=>/g,
        '.filter((item: any) =>'
      )
      modified = true
    }

    if (content.includes('.map(item =>') || content.includes('.map((item)')) {
      content = content.replace(
        /\.map\(\s*\(?item\)?\s*=>/g,
        '.map((item: any) =>'
      )
      modified = true
    }

    if (modified) {
      writeFileSync(file, content)
      console.log(`✅ 修正: ${file}`)
    }
  }

  console.log('\n修正完了！')
}

// 実行
fixTypeScriptErrors().catch(console.error)