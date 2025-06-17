// localStorage のデータ移行処理

export function migrateLocalStorageData() {
  if (typeof window === 'undefined') return

  try {
    // 1. ranking-config を user-preferences に移行
    const rankingConfig = localStorage.getItem('ranking-config')
    if (rankingConfig) {
      const userPrefs = localStorage.getItem('user-preferences')
      if (!userPrefs) {
        // user-preferences が存在しない場合のみ移行
        const config = JSON.parse(rankingConfig)
        const newPrefs = {
          lastGenre: config.genre || 'all',
          lastPeriod: config.period || '24h',
          lastTag: config.tag,
          theme: 'light', // デフォルトテーマ
          version: 1,
          updatedAt: new Date().toISOString()
        }
        localStorage.setItem('user-preferences', JSON.stringify(newPrefs))
      }
      // 移行後は削除
      localStorage.removeItem('ranking-config')
    }

    // 2. theme を user-preferences に移行
    const theme = localStorage.getItem('theme')
    if (theme) {
      const userPrefs = localStorage.getItem('user-preferences')
      if (userPrefs) {
        const prefs = JSON.parse(userPrefs)
        if (!prefs.theme) {
          prefs.theme = theme
          prefs.updatedAt = new Date().toISOString()
          localStorage.setItem('user-preferences', JSON.stringify(prefs))
        }
      } else {
        // user-preferences が存在しない場合は新規作成
        const newPrefs = {
          lastGenre: 'all',
          lastPeriod: '24h',
          theme: theme,
          version: 1,
          updatedAt: new Date().toISOString()
        }
        localStorage.setItem('user-preferences', JSON.stringify(newPrefs))
      }
      // 移行後は削除
      localStorage.removeItem('theme')
    }

    // 3. ng-list を user-ng-list に移行（存在しない場合のみ）
    const ngList = localStorage.getItem('ng-list')
    const userNgList = localStorage.getItem('user-ng-list')
    if (ngList && !userNgList) {
      // user-ng-list が存在しない場合のみ移行
      localStorage.setItem('user-ng-list', ngList)
    }
    // ng-list は常に削除（サーバー側のNGリストは使用しないため）
    if (ngList) {
      localStorage.removeItem('ng-list')
    }

    // 4. 不要なデータの削除
    // popular-tags-backup:* などの古いバックアップデータを削除
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('popular-tags-backup:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))

  } catch (error) {
    // エラーは無視（移行失敗しても動作に影響しない）
  }
}