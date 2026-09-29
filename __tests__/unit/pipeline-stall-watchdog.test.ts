// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  reportPipelineProgress,
  startGroupStallWatchdog,
  summarizeActiveResources,
} from '../../lib/pipeline/stall-watchdog'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function errorText(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
}

describe('group stall watchdog', () => {
  it('stays quiet while the group keeps reporting progress', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const watchdog = startGroupStallWatchdog(3, { exit, getActiveResources: () => [] })
    try {
      for (let minute = 0; minute < 30; minute += 1) {
        reportPipelineProgress(`ranking page ${minute}`)
        await vi.advanceTimersByTimeAsync(60_000)
      }
      expect(exit).not.toHaveBeenCalled()
    } finally {
      watchdog.stop()
    }
  })

  it('prints active resources and fails the group after ten idle minutes', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const watchdog = startGroupStallWatchdog(5, {
      exit,
      getActiveResources: () => ['Timeout', 'TCPSocketWrap', 'Timeout'],
    })
    try {
      reportPipelineProgress('tag cache shard 17')
      await vi.advanceTimersByTimeAsync(9 * 60_000)
      expect(exit).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(90_000)
      expect(exit).toHaveBeenCalledTimes(1)
      expect(exit).toHaveBeenCalledWith(1)
      const text = errorText(error)
      expect(text).toContain('Group 5 made no progress for 600s')
      expect(text).toContain('last progress: tag cache shard 17')
      expect(text).toContain('{"Timeout":2,"TCPSocketWrap":1}')

      await vi.advanceTimersByTimeAsync(30 * 60_000)
      expect(exit).toHaveBeenCalledTimes(1)
    } finally {
      watchdog.stop()
    }
  })

  it('summarizes process.getActiveResourcesInfo() by default', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'getActiveResourcesInfo').mockReturnValue(['FSReqCallback', 'Timeout'])
    const watchdog = startGroupStallWatchdog(2, { exit })
    try {
      await vi.advanceTimersByTimeAsync(11 * 60_000)
      expect(exit).toHaveBeenCalledWith(1)
      expect(errorText(error)).toContain('{"FSReqCallback":1,"Timeout":1}')
    } finally {
      watchdog.stop()
    }
  })

  it('stops watching once the group has finished', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const watchdog = startGroupStallWatchdog(1, { exit, getActiveResources: () => [] })
    watchdog.stop()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(exit).not.toHaveBeenCalled()
    expect(() => reportPipelineProgress('after stop')).not.toThrow()
  })

  it('counts active resources by type', () => {
    expect(summarizeActiveResources(['TTYWrap', 'Timeout', 'TTYWrap'])).toEqual({ TTYWrap: 2, Timeout: 1 })
  })
})
