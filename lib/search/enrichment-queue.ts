/** A queue shared by tags and owners for one mounted search screen. */
export function createEnrichmentQueue(concurrency = 2) {
  let active = 0
  const pending: Array<() => void> = []
  const drain = () => {
    while (active < concurrency && pending.length) pending.shift()?.()
  }
  return {
    run(task: () => Promise<void>, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const cancel = () => {
          const index = pending.indexOf(start)
          if (index !== -1) {
            pending.splice(index, 1)
            resolve()
          }
        }
        const start = () => {
          signal?.removeEventListener('abort', cancel)
          if (signal?.aborted) {
            resolve()
            return
          }
          active++
          Promise.resolve()
            .then(() => (signal?.aborted ? undefined : task()))
            .then(resolve, reject)
            .finally(() => {
              active--
              drain()
            })
        }
        pending.push(start)
        signal?.addEventListener('abort', cancel, { once: true })
        drain()
      })
    },
  }
}
