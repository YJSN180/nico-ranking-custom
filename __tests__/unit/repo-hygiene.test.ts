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
  'workers/video-stats-updater/src/index-backup.js',
  'workers/video-stats-updater/src/index-fixed.js',
  'workers/video-stats-updater/test-debug.js',
  'workers/video-stats-updater/wrangler-debug.toml',
]

describe('repo hygiene', () => {
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
