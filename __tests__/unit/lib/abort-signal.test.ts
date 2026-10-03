import { describe, it, expect } from 'vitest'
import { anySignal, withTimeout } from '@/lib/abort-signal'

describe('anySignal', () => {
  it('どれか 1 つが中断されたら中断され、理由を引き継ぐ', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = anySignal([a.signal, undefined, b.signal])
    expect(combined.aborted).toBe(false)
    b.abort(new Error('deadline'))
    expect(combined.aborted).toBe(true)
    expect((combined.reason as Error).message).toBe('deadline')
  })

  it('すでに中断されたシグナルがあれば最初から中断されている', () => {
    const a = new AbortController()
    a.abort()
    expect(anySignal([new AbortController().signal, a.signal]).aborted).toBe(true)
  })
})

describe('withTimeout', () => {
  it('タイムアウトで中断される', async () => {
    const signal = withTimeout(10)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(signal.aborted).toBe(true)
  })

  it('全体の期限が先に切れたらそこで中断される', () => {
    const overall = new AbortController()
    const signal = withTimeout(60_000, overall.signal)
    overall.abort()
    expect(signal.aborted).toBe(true)
  })
})
