/**
 * Reverse geocoding — turns a lat/lng into a human-readable address.
 * Uses OpenStreetMap's free Nominatim API (same provider as
 * LocationSearch's forward search), no API key required.
 *
 * NOTE on production use: same usage-policy note as LocationSearch.jsx —
 * fine for a college project / low-traffic demo called directly from
 * the client; for production, proxy through the FastAPI backend so
 * User-Agent/rate-limiting can be controlled server-side.
 */
const geocodeService = {
  /**
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<string>} best-effort human-readable address.
   *   Falls back to a "lat, lng" string if the lookup fails, so the
   *   caller never has to special-case a missing address.
   */
  reverseGeocode: async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      )
      if (!res.ok) throw new Error('Reverse geocoding request failed')
      const data = await res.json()
      if (data?.display_name) return data.display_name
      throw new Error('No address found for this location')
    } catch {
      // Graceful fallback — the analysis can still proceed with
      // coordinates alone; the user isn't blocked by a geocoding outage.
      return `Near ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`
    }
  },
}

export default geocodeService
