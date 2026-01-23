/**
 * 非同期処理のエラーハンドリングユーティリティ
 *
 * 統一されたエラーハンドリングパターンを提供し、
 * コードベース全体で一貫したエラー処理を実現する
 */

/**
 * 非同期関数をエラーハンドリング付きで実行する
 *
 * @param fn - 実行する非同期関数
 * @param fallback - エラー時に返すフォールバック値
 * @param onError - エラー発生時のコールバック（オプション）
 * @returns 成功時は関数の結果、失敗時はフォールバック値
 *
 * @example
 * const data = await withErrorHandling(
 *   () => fetchData(),
 *   [],
 *   (error) => console.error('Fetch failed:', error)
 * );
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    onError?.(error);
    console.error('Async operation failed:', error);
    return fallback;
  }
}

/**
 * 値がErrorインスタンスかどうかを判定する型ガード
 *
 * @param error - 判定する値
 * @returns Errorインスタンスの場合true
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * 任意のエラー値から文字列メッセージを取得する
 *
 * @param error - エラー値（Error、string、その他）
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}
