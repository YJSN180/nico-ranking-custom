// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { R2_SERVER_ERROR_CODES, r2ErrorCode, withR2Retry } from '../../workers/utils/r2-retry.js'

const internalError = () => new Error('get: We encountered an internal error. Please try again. (10001)')
const busyObject = () => new Error('list: Reduce your concurrent request rate for the same object. (10058)')

describe('r2ErrorCode', () => {
  it('reads the code the R2 binding appends to its messages', () => {
    expect(r2ErrorCode(internalError())).toBe(10001)
    expect(r2ErrorCode(busyObject())).toBe(10058)
    expect(r2ErrorCode(new Error('Network connection lost.'))).toBeNull()
    expect(r2ErrorCode('not an error')).toBeNull()
  })
})

describe('withR2Retry', () => {
  it('retries listed codes with the given delays and returns the first success', async () => {
    const sleep = vi.fn(async () => {})
    const operation = vi.fn().mockRejectedValueOnce(internalError()).mockRejectedValueOnce(internalError()).mockResolvedValue('ok')

    await expect(
      withR2Retry(operation, { retryableCodes: R2_SERVER_ERROR_CODES, delaysMs: [50, 150], sleep }),
    ).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(50)
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(150)
  })

  it('stops after the last delay and rethrows the original error', async () => {
    const error = internalError()
    const operation = vi.fn().mockRejectedValue(error)

    await expect(
      withR2Retry(operation, { retryableCodes: R2_SERVER_ERROR_CODES, delaysMs: [1, 1], sleep: async () => {} }),
    ).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('does not retry unlisted codes or errors without a code', async () => {
    for (const error of [busyObject(), new Error('get: Access denied (10003)'), new Error('boom')]) {
      const operation = vi.fn().mockRejectedValue(error)
      await expect(
        withR2Retry(operation, { retryableCodes: R2_SERVER_ERROR_CODES, delaysMs: [1, 1], sleep: async () => {} }),
      ).rejects.toBe(error)
      expect(operation).toHaveBeenCalledTimes(1)
    }
  })
})
