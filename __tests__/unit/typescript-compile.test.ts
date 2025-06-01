import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'

describe('TypeScript Compilation', () => {
  let typeCheckResult: { success: boolean; errors: string[] }

  beforeAll(() => {
    try {
      execSync('npm run typecheck', { encoding: 'utf-8' })
      typeCheckResult = { success: true, errors: [] }
    } catch (error: any) {
      const output = error.stdout || error.message
      const errors = output.split('\n').filter((line: string) => line.includes('error TS'))
      typeCheckResult = { success: false, errors }
    }
  })

  it('should compile without TypeScript errors', () => {
    if (!typeCheckResult.success) {
      console.error('TypeScript errors found:')
      typeCheckResult.errors.forEach(error => console.error(error))
    }
    expect(typeCheckResult.success).toBe(true)
  })

  it('should have no type errors in critical files', () => {
    const criticalFiles = [
      'app/api/cron/proxy-update/route.ts',
      'app/api/ranking/route.ts',
      'lib/complete-hybrid-scraper.ts',
      'lib/popular-tags.ts'
    ]

    const criticalErrors = typeCheckResult.errors.filter(error =>
      criticalFiles.some(file => error.includes(file))
    )

    expect(criticalErrors).toHaveLength(0)
  })
})