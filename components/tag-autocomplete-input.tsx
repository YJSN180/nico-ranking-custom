'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
} from 'react'
import { captureBrowserRateLimit } from '@/lib/sentry/capture'
import { queryCompletion, completeQuery } from '@/lib/search/query-completion'
import styles from './tag-autocomplete-input.module.css'

/** 候補の一覧の最後に出す操作（「この動画IDを表示」「ユーザーを探す」など） */
export interface AutocompleteAction {
  key: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}

interface TagAutocompleteInputProps {
  value: string
  type?: 'text' | 'search'
  onChange: (value: string) => void
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
  ariaLabel?: string
  className?: string
  wrapperClassName?: string
  /** Search expressions complete the term at the caret; tag fields replace the whole value. */
  completionMode?: 'tag' | 'query'
  id?: string
  /** Tag fields that collect several words take the chosen candidate here instead of as the field value. */
  onPick?: (tag: string) => void
  /** Extra rows after the tag candidates, in the same listbox (one keyboard model). */
  actions?: AutocompleteAction[]
  /** false skips fetching tag candidates (e.g. the value is a video ID). */
  suggest?: boolean
}

export function TagAutocompleteInput({
  value,
  type = 'text',
  onChange,
  onKeyPress,
  placeholder,
  style,
  disabled = false,
  className,
  wrapperClassName,
  ariaLabel,
  completionMode = 'tag',
  id,
  onPick,
  actions,
  suggest = true,
}: TagAutocompleteInputProps) {
  const suggestionsId = useId()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  // Actions appear together with the candidates (after the request settles) so rows never move under the pointer.
  const [actionsShown, setActionsShown] = useState(false)
  const [selected, setSelected] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const composing = useRef(false)
  const restoreCaret = useRef<number | null>(null)
  const requestKey = useRef('')
  // Per-field memory only: never persist the user's typed queries in storage.
  const cache = useRef(new Map<string, { expires: number; tags: string[] }>())
  const retryAt = useRef(0)
  // Keep the list closed until the user types again after a value set from outside (search run, URL, history)
  // or after the user acted on the field (an action, Enter); browsers fire select events at any time.
  const settled = useRef(false)
  /** The last value this field produced itself (typing or choosing); null before any interaction. */
  const ownValue = useRef<string | null>(null)
  const context = useRef<{ value: string; start: number; end: number } | null>(
    null,
  )

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    controller.current?.abort()
    controller.current = null
    generation.current++
    requestKey.current = ''
  }, [])
  const dismiss = useCallback(() => {
    cancel()
    setOpen(false)
    setActionsShown(false)
    setSelected(-1)
  }, [cancel])

  const schedule = useCallback(
    (input: HTMLInputElement) => {
      if (
        composing.current ||
        settled.current ||
        disabled ||
        document.activeElement !== input
      )
        return
      const current = {
        value: input.value,
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
      }
      const term =
        completionMode === 'query'
          ? queryCompletion(current.value, current.start, current.end)
          : { query: current.value.trim() }
      const query = term?.query ?? ''
      const key = JSON.stringify([query.toLowerCase(), completionMode])
      context.current = current
      if (key === requestKey.current) return
      dismiss()
      if (!suggest || query.length < 2 || query.length > 100) {
        requestKey.current = key
        setActionsShown(true)
        return
      }
      if (Date.now() < retryAt.current) {
        setActionsShown(true)
        return
      }
      requestKey.current = key
      const id = generation.current
      const showActions = () => {
        if (
          generation.current === id &&
          document.activeElement === inputRef.current
        )
          setActionsShown(true)
      }
      const show = (tags: string[]) => {
        if (
          generation.current !== id ||
          document.activeElement !== inputRef.current
        )
          return
        const safeTags =
          completionMode === 'query'
            ? tags.filter((tag) => !tag.includes('"'))
            : tags
        setSuggestions(safeTags)
        setOpen(safeTags.length > 0)
        setActionsShown(true)
        setSelected(-1)
      }
      timer.current = setTimeout(async () => {
        const cached = cache.current.get(query.toLowerCase())
        if (cached && cached.expires > Date.now()) {
          show(cached.tags)
          return
        }
        const abort = new AbortController()
        controller.current = abort
        const timeout = setTimeout(() => abort.abort(), 5000)
        try {
          const url = new URL('/api/tags/autocomplete', window.location.origin)
          url.searchParams.set('q', query)
          url.searchParams.set('limit', '10')
          const response = await fetch(url.toString(), { signal: abort.signal })
          if (abort.signal.aborted || generation.current !== id) return
          if (response.status === 429) {
            const header = response.headers.get('retry-after')
            const seconds = header ? Number(header) : NaN
            const wait = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(header ?? '') - Date.now()
            retryAt.current =
              Date.now() + Math.max(1000, Number.isFinite(wait) ? wait : 30000)
            captureBrowserRateLimit({
              surface: 'tag-autocomplete',
              endpointFamily: '/api/tags/autocomplete',
              fingerprint: ['browser-tag-autocomplete-429'],
              retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
            })
            showActions()
            return
          }
          if (!response.ok) {
            showActions()
            return
          }
          const data = await response.json()
          if (abort.signal.aborted || generation.current !== id) return
          const tags = Array.isArray(data.suggestions)
            ? [
                ...new Set<string>(
                  data.suggestions.filter(
                    (tag: unknown): tag is string =>
                      typeof tag === 'string' &&
                      tag.length > 0 &&
                      tag.length <= 100,
                  ),
                ),
              ].slice(0, 10)
            : []
          cache.current.delete(query.toLowerCase())
          if (cache.current.size >= 100)
            cache.current.delete(cache.current.keys().next().value!)
          cache.current.set(query.toLowerCase(), {
            tags,
            expires: Date.now() + 5 * 60 * 1000,
          })
          show(tags)
        } catch {
          // Suggestions are optional; typing and submitting remain available offline.
          showActions()
        } finally {
          clearTimeout(timeout)
          if (controller.current === abort) controller.current = null
        }
      }, 300)
    },
    [completionMode, disabled, dismiss, suggest],
  )

  // URL changes, form resets and externally changed values must invalidate pending suggestions.
  useEffect(() => {
    // Nothing to invalidate before the first interaction (the initial value is not an outside change).
    if (ownValue.current === null || ownValue.current === value) return
    settled.current = true
    dismiss()
  }, [value, dismiss])
  useEffect(() => {
    dismiss()
  }, [completionMode, disabled, dismiss])
  useEffect(() => cancel, [cancel])
  // The keystroke that turns the value into (or out of) a video ID still runs the previous render's
  // schedule; re-evaluate with the current setting so no stale tag request or candidate survives.
  useEffect(() => {
    const input = inputRef.current
    if (!input || document.activeElement !== input) return
    requestKey.current = ''
    schedule(input)
  }, [suggest, schedule])
  useLayoutEffect(() => {
    if (restoreCaret.current === null) return
    inputRef.current?.setSelectionRange(
      restoreCaret.current,
      restoreCaret.current,
    )
    restoreCaret.current = null
  }, [value])
  const options: Array<
    | { kind: 'tag'; tag: string }
    | { kind: 'action'; action: AutocompleteAction }
  > = [
    ...(open && suggest
      ? suggestions.map((tag) => ({ kind: 'tag' as const, tag }))
      : []),
    ...(actionsShown && actions
      ? actions.map((action) => ({ kind: 'action' as const, action }))
      : []),
  ]
  const listOpen = options.length > 0

  // 矢印で選んだ候補を、一覧の中と、一覧を囲むスクロール領域（モーダルの本文など）の両方で見えるところへ寄せる
  useEffect(() => {
    if (selected < 0 || !listOpen) return
    const option = document.getElementById(`${suggestionsId}-${selected}`)
    if (typeof option?.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [selected, listOpen, suggestionsId])

  const choose = (tag: string) => {
    const current = context.current
    if (!current || current.value !== value) {
      dismiss()
      return
    }
    if (onPick && completionMode === 'tag') {
      dismiss()
      onPick(tag)
      inputRef.current?.focus()
      return
    }
    let next = { value: tag, caret: tag.length }
    if (completionMode === 'query') {
      const term = queryCompletion(value, current.start, current.end)
      const completed = term && completeQuery(value, term, tag)
      if (!completed) {
        dismiss()
        return
      }
      next = completed
    }
    dismiss()
    const nextContext = {
      value: next.value,
      start: next.caret,
      end: next.caret,
    }
    context.current = nextContext
    requestKey.current = JSON.stringify([tag.toLowerCase(), completionMode])
    restoreCaret.current = next.caret
    ownValue.current = next.value
    onChange(next.value)
    inputRef.current?.focus()
    if (next.value === value) {
      inputRef.current?.setSelectionRange(next.caret, next.caret)
      restoreCaret.current = null
    }
  }

  const pick = (option: (typeof options)[number]) => {
    if (option.kind === 'tag') {
      choose(option.tag)
      return
    }
    settled.current = true
    dismiss()
    option.action.onSelect()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      if (event.key === 'Enter') event.preventDefault()
      return
    }
    if (event.key === 'Escape') {
      if (listOpen) {
        event.preventDefault()
        event.stopPropagation()
      }
      settled.current = true
      dismiss()
    } else if (event.key === 'Enter') {
      const option = listOpen && selected >= 0 ? options[selected] : undefined
      if (option) {
        event.preventDefault()
        pick(option)
      } else {
        settled.current = true
        dismiss()
        if (onKeyPress) {
          event.preventDefault()
          onKeyPress(event)
        }
      }
    } else if (
      listOpen &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      event.preventDefault()
      setSelected((previous) =>
        event.key === 'ArrowDown'
          ? (previous + 1) % options.length
          : (previous <= 0 ? options.length : previous) - 1,
      )
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`${styles.root} ${wrapperClassName ?? ''}`}
      style={style}
    >
      <input
        ref={inputRef}
        id={id}
        type={type}
        role="combobox"
        aria-label={ariaLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? suggestionsId : undefined}
        aria-activedescendant={
          listOpen && selected >= 0 ? `${suggestionsId}-${selected}` : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(event) => {
          settled.current = false
          ownValue.current = event.target.value
          onChange(event.target.value)
          schedule(event.currentTarget)
        }}
        onSelect={(event) => schedule(event.currentTarget)}
        onFocus={(event) => schedule(event.currentTarget)}
        onKeyDown={handleKeyDown}
        onBlur={dismiss}
        onCompositionStart={() => {
          composing.current = true
          dismiss()
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          schedule(event.currentTarget)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={`${styles.input} ${className ?? ''}`}
        style={style}
      />
      {listOpen && (
        <div
          id={suggestionsId}
          role="listbox"
          aria-label={actions?.length ? '候補' : 'タグ候補'}
          className={styles.list}
        >
          {options.map((option, index) => (
            <button
              key={
                option.kind === 'tag'
                  ? `tag:${option.tag}`
                  : `action:${option.action.key}`
              }
              id={`${suggestionsId}-${index}`}
              role="option"
              aria-selected={index === selected}
              tabIndex={-1}
              type="button"
              className={
                option.kind === 'tag'
                  ? styles.option
                  : `${styles.option} ${styles.action}`
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setSelected(index)}
            >
              {option.kind === 'tag' ? (
                option.tag
              ) : (
                <>
                  {option.action.icon}
                  <span className={styles.actionLabel}>
                    {option.action.label}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
