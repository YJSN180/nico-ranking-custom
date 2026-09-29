/**
 * Retries transient failures of the R2 binding.
 *
 * The binding reports failures as "<operation>: <message> (<code>)".
 * https://developers.cloudflare.com/r2/api/error-codes/
 */

/** 10001 internal error (500) and 10043 service unavailable (503): retry as-is. */
export const R2_SERVER_ERROR_CODES = Object.freeze([10001, 10043])

/** 10058 (429): too many concurrent requests for the same object; retry after backing off. */
export const R2_TOO_MUCH_CONCURRENCY = 10058

/**
 * @param {unknown} error
 * @returns {number | null}
 */
export function r2ErrorCode(error) {
  const message = error instanceof Error ? error.message : ''
  const match = /\((\d{5,6})\)\s*$/.exec(message)
  return match ? Number(match[1]) : null
}

/** @param {number} ms */
function sleepFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `operation`, retrying once per entry in `delaysMs` while it fails with one of `retryableCodes`.
 * Each wait adds up to 50% jitter so callers that failed together do not retry in lockstep.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ retryableCodes: readonly number[], delaysMs: readonly number[], sleep?: (ms: number) => Promise<unknown> }} policy
 * @returns {Promise<T>}
 */
export async function withR2Retry(operation, { retryableCodes, delaysMs, sleep = sleepFor }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const code = r2ErrorCode(error)
      if (attempt >= delaysMs.length || code === null || !retryableCodes.includes(code)) throw error
      await sleep(delaysMs[attempt] * (1 + Math.random() / 2))
    }
  }
}
