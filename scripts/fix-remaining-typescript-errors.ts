#!/usr/bin/env ts-node

import fs from 'fs/promises'
import path from 'path'

const files = [
  '__tests__/unit/complete-hybrid-scraper-pagination.test.ts',
  '__tests__/unit/scraper-pagination.test.ts',
  '__tests__/unit/tag-ranking-300-limit.test.tsx',
  '__tests__/unit/tag-ranking-deduplication.test.ts',
]

async function fixFile(filePath: string) {
  console.log(`Fixing ${filePath}...`)
  
  let content = await fs.readFile(filePath, 'utf-8')
  
  if (filePath.includes('complete-hybrid-scraper-pagination')) {
    // Fix mockPages[n] to mockPages[n] || []
    content = content.replace(/createMockHtml\(mockPages\[(\d+)\], (\d+)\)/g, 'createMockHtml(mockPages[$1] || [], $2)')
    
    // Fix array index access with optional chaining
    content = content.replace(/expect\(result\.items\[(\d+)\]\.(id|title|rank)\)/g, 'expect(result.items[$1]?.$2)')
  }
  
  if (filePath.includes('scraper-pagination')) {
    // Fix array index access with optional chaining
    content = content.replace(/expect\(result\.items\[(\d+)\]\.(id|title|views|comments|mylists|likes|authorId|authorName|registeredAt|rank)\)/g, 'expect(result.items[$1]?.$2)')
  }
  
  if (filePath.includes('tag-ranking-300-limit')) {
    // Add missing vi import
    if (!content.includes("import { vi }")) {
      content = content.replace(
        "import { describe, it, expect, beforeEach } from 'vitest'",
        "import { describe, it, expect, beforeEach, vi } from 'vitest'"
      )
    }
  }
  
  if (filePath.includes('tag-ranking-deduplication')) {
    // Fix Promise return type
    content = content.replace(
      /mockResolvedValue\({ items: (.*?) }\)/g,
      'mockResolvedValue(Promise.resolve({ items: $1, popularTags: [] }))'
    )
    
    // Fix RankingItem type issues
    content = content.replace(
      /as RankingItem\[\]/g,
      'as unknown as RankingItem[]'
    )
    
    // Fix page parameter handling
    content = content.replace(
      /const page = Number\(url\.searchParams\.get\('page'\)\) \|\| 1/g,
      'const pageParam = url.searchParams.get(\'page\')\n        const page = pageParam ? Number(pageParam) : 1'
    )
    
    // Fix Math.max usage
    content = content.replace(
      /Math\.max\(1, page\)/g,
      'Math.max(1, page ?? 1)'
    )
  }
  
  await fs.writeFile(filePath, content, 'utf-8')
  console.log(`✓ Fixed ${filePath}`)
}

async function main() {
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file)
    await fixFile(fullPath)
  }
  console.log('\nAll TypeScript errors fixed!')
}

main().catch(console.error)