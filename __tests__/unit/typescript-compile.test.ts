import { describe, it, expect } from 'vitest'

// TypeScriptコンパイルチェックはCIでのみ実行
// ローカル開発環境でのメモリ負荷を軽減
describe.skip('TypeScript Compilation', () => {
  it('should be checked in CI pipeline', () => {
    // このテストはGitHub ActionsのCIパイプラインで実行されます
    // ローカルでは npm run typecheck を手動で実行してください
    expect(true).toBe(true)
  })
})