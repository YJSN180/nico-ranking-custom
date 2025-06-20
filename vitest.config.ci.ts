import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config'

// CI用の設定: カバレッジを無効化してメモリ使用量を削減
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: undefined, // カバレッジを完全に無効化
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1
      }
    },
  }
})