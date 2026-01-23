/**
 * 安全なlocalStorageアクセス用ユーティリティ
 *
 * プライベートブラウジングモードやストレージ無効設定時でも
 * 例外を発生させずに動作する
 */

/**
 * localStorageが利用可能かどうかを確認
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const testKey = '__storage_test__'
    window.localStorage.setItem(testKey, testKey)
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * 安全にlocalStorageから値を取得
 * @param key 取得するキー
 * @returns 値またはnull（エラー時もnull）
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 安全にlocalStorageに値を保存
 * @param key 保存するキー
 * @param value 保存する値
 * @returns 成功時true、失敗時false
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * 安全にlocalStorageから値を削除
 * @param key 削除するキー
 * @returns 成功時true、失敗時false
 */
export function safeRemoveItem(key: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * 安全にlocalStorageをクリア
 * @returns 成功時true、失敗時false
 */
export function safeClear(): boolean {
  if (typeof window === 'undefined') return false

  try {
    localStorage.clear()
    return true
  } catch {
    return false
  }
}

/**
 * 安全にJSONを取得してパース
 * @param key 取得するキー
 * @returns パースされたオブジェクトまたはnull
 */
export function safeGetJSON<T>(key: string): T | null {
  const value = safeGetItem(key)
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * 安全にオブジェクトをJSON文字列化して保存
 * @param key 保存するキー
 * @param value 保存するオブジェクト
 * @returns 成功時true、失敗時false
 */
export function safeSetJSON<T>(key: string, value: T): boolean {
  try {
    const stringified = JSON.stringify(value)
    return safeSetItem(key, stringified)
  } catch {
    return false
  }
}
