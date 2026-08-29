import { useEffect, useState } from 'react'

/**
 * Debounces a fast-changing value (e.g. search input) so dependent
 * effects (like an API call) only fire after the user pauses typing.
 */
export default function useDebounce(value, delayMs = 400) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
