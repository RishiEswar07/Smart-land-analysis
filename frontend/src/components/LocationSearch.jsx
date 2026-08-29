import { useEffect, useRef, useState } from 'react'
import useDebounce from '../hooks/useDebounce'

/**
 * Place-name search box (e.g. "Madurai", "KLN College", "Chennai").
 * Uses OpenStreetMap's free Nominatim geocoding API — no key required.
 *
 * NOTE on production use: Nominatim's usage policy asks for a max of
 * 1 request/second and a descriptive User-Agent, which browsers won't
 * let JS set on fetch(). For a college project / low-traffic demo,
 * calling it directly from the client (as done here) is fine. For a
 * production deployment, proxy this through the FastAPI backend
 * instead so the User-Agent/rate-limit can be controlled server-side.
 */
export default function LocationSearch({ onSelect, placeholder = 'Search Google Maps location — e.g. Madurai, KLN College…' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const debouncedQuery = useDebounce(query, 450)

  useEffect(() => {
    const term = debouncedQuery.trim()
    if (term.length < 3) {
      setResults([])
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(term)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data) ? data : [])
        setOpen(true)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  // Close the dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePick = (place) => {
    setQuery(place.display_name)
    setOpen(false)
    onSelect?.({
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      label: place.display_name,
      zoom: place.class === 'place' ? 13 : 17, // zoom in tighter for a specific building/POI than a whole city
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3.5 py-2.5">
        <span className="text-slate-dim text-sm">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full text-sm text-ink outline-none placeholder:text-slate-dim"
        />
        {loading && <span className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-blue animate-spin shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1.5 w-full max-h-64 overflow-y-auto rounded-lg border border-line bg-white shadow-lift">
          {results.map((place) => (
            <li key={place.place_id}>
              <button
                type="button"
                onClick={() => handlePick(place)}
                className="w-full text-left px-3.5 py-2.5 text-sm text-ink hover:bg-blue-mist transition-colors border-b border-line last:border-0"
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && debouncedQuery.trim().length >= 3 && results.length === 0 && (
        <div className="absolute z-[1000] mt-1.5 w-full rounded-lg border border-line bg-white shadow-lift px-3.5 py-3 text-xs text-slate-dim">
          No places found for "{debouncedQuery}"
        </div>
      )}
    </div>
  )
}
