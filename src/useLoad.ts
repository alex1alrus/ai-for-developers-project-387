import { useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'failed'; error: unknown } | { status: 'loaded'; data: T }

/**
 * Runs `load(key)` on mount and whenever `key` changes. `retry` shows the loader again; `reload` refreshes in place.
 * `load` must be stable (a module-level function), or it reruns on every render.
 */
export function useLoad<T>(load: (key: string) => Promise<T>, key = '') {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    load(key).then(
      (data) => setState({ status: 'loaded', data }),
      (error: unknown) => setState({ status: 'failed', error }),
    )
  }, [load, key, attempt])

  const reload = () => setAttempt((n) => n + 1)
  const retry = () => {
    setState({ status: 'loading' })
    reload()
  }

  return { state, retry, reload }
}
