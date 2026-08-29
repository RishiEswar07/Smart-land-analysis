import { useCallback, useEffect, useState } from 'react'

/**
 * Generic data-fetching hook.
 * Wraps a service call with loading/error/data state and a `refetch`
 * function, so pages don't repeat the same try/catch boilerplate.
 *
 * @param {Function} fetcher - async function returning data
 * @param {Array} deps - dependency array, same semantics as useEffect
 * @param {boolean} immediate - whether to run on mount
 */
export default function useFetch(fetcher, deps = [], immediate = true) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)

  const run = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher(...args)
      setData(result)
      return result
    } catch (err) {
      setError(err.message || 'Failed to fetch data')
      throw err
    } finally {
      setLoading(false)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) {
      run().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, refetch: run }
}
