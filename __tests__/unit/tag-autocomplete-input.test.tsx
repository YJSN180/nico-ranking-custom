import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'

vi.mock('@/lib/sentry/capture', () => ({
  captureBrowserRateLimit: vi.fn(),
}))

function ControlledTagAutocompleteInput() {
  const [value, setValue] = useState('')

  return (
    <TagAutocompleteInput
      value={value}
      onChange={setValue}
      placeholder="タグを入力"
    />
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('TagAutocompleteInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps only the latest autocomplete response', async () => {
    const first = createDeferred<Response>()
    const second = createDeferred<Response>()

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    )

    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByPlaceholderText('タグを入力')

    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    fireEvent.change(input, { target: { value: 'voc' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await act(async () => {
      second.resolve(
        new Response(JSON.stringify({ suggestions: ['VOCALOID'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await Promise.resolve()
    })

    expect(await screen.findByText('VOCALOID')).toBeInTheDocument()

    await act(async () => {
      first.resolve(
        new Response(JSON.stringify({ suggestions: ['VOICEROID'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await Promise.resolve()
    })

    expect(screen.queryByText('VOICEROID')).not.toBeInTheDocument()
    expect(screen.getByText('VOCALOID')).toBeInTheDocument()
  })

  it('captures autocomplete 429s in Sentry', async () => {
    const { captureBrowserRateLimit } = await import('@/lib/sentry/capture')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '10' },
        }),
      ),
    )

    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByPlaceholderText('タグを入力')

    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(captureBrowserRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'tag-autocomplete',
        endpointFamily: '/api/tags/autocomplete',
        fingerprint: ['browser-tag-autocomplete-429'],
        retryAfterSeconds: 10,
      }),
    )
  })
})
