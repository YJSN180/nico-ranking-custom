import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const removedArtifactPaths = [
  'app/globals.css.backup',
  'components/header-with-settings.tsx.backup',
  'components/navigation.tsx.backup',
  'components/pagination.tsx.backup',
  'components/ranking-selector.tsx.backup',
  'debug-after-click.png',
  'debug-custom-rankings.html',
  'debug-safari-detection.js',
  // 実在の投稿者 ID・名前を含むランキングデータ（パイプラインの出力は ./tmp/ に置く）
  'ranking-group-1.json',
  'workers/video-stats-updater/src/index-backup.js',
  'workers/video-stats-updater/src/index-fixed.js',
  'workers/video-stats-updater/test-debug.js',
  'workers/video-stats-updater/wrangler-debug.toml',
]

// public/ の検証用ファイル（test-*.html、*-test.html、check-*.html、sw-custom.js）
const verificationPublicFilePattern = /(^|-)(test|debug|check)[-.]|^sw-custom\./

// 開発時だけ動き、本番ビルドでは 404 を返すルート（__tests__/unit/api/debug-log.test.ts）
const devOnlyRoutes = ['api/debug-log']

describe('repo hygiene', () => {
  it('keeps verification pages out of what production serves', () => {
    const appDir = path.join(repoRoot, 'app')
    const routes = [
      ...fs.readdirSync(appDir),
      ...fs.readdirSync(path.join(appDir, 'api')).map((name) => `api/${name}`),
    ]
    const verificationRoutes = routes.filter(
      (route) => /^(api\/)?(test|debug)/.test(route) && !devOnlyRoutes.includes(route),
    )
    const verificationPublicFiles = fs
      .readdirSync(path.join(repoRoot, 'public'))
      .filter((name) => verificationPublicFilePattern.test(name))

    expect(verificationRoutes).toEqual([])
    expect(verificationPublicFiles).toEqual([])
  })

  it('keeps transient backup/debug artifacts out of the repository', () => {
    const existingArtifacts = removedArtifactPaths.filter((artifactPath) =>
      fs.existsSync(path.join(repoRoot, artifactPath)),
    )

    expect(existingArtifacts).toEqual([])
  })

  it('ignores backup/debug artifacts and generated dist output', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')

    expect(gitignore).toContain('/dist')
    expect(gitignore).toContain('*.backup')
    expect(gitignore).toContain('debug-*.png')
    expect(gitignore).toContain('debug-*.html')
    expect(gitignore).toContain('debug-*.js')
    expect(gitignore).toContain('workers/video-stats-updater/src/*-backup.js')
    expect(gitignore).toContain('workers/video-stats-updater/src/*-fixed.js')
    expect(gitignore).toContain('workers/video-stats-updater/test-debug.js')
    expect(gitignore).toContain('workers/video-stats-updater/wrangler-debug.toml')
  })
})
