/**
 * Reverse geocoding service — converts latitude/longitude coordinates into a clean, human-readable address.
 * Integrates with OpenStreetMap's Nominatim Reverse Geocoding API with proper timeout handling,
 * structured address synthesis, and meaningful fallbacks (without using coordinates as false addresses).
 */
const geocodeService = {
  /**
   * Performs reverse geocoding with timeout and structured parsing.
   * @param {number} lat - Latitude in decimal degrees
   * @param {number} lng - Longitude in decimal degrees
   * @returns {Promise<string>} Human-readable address string or meaningful fallback message
   */
  reverseGeocode: async (lat, lng) => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return 'Address data unavailable (No coordinates provided)'
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6500)

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        throw new Error(`Reverse geocoding HTTP ${res.status}`)
      }

      const data = await res.json()
      if (!data) {
        throw new Error('Empty geocoding response')
      }

      // 1. Synthesize structured address from address details if available
      const addr = data.address
      if (addr && typeof addr === 'object') {
        const parts = []

        const thoroughfare = [
          addr.house_number,
          addr.road || addr.street || addr.pedestrian || addr.footway || addr.path,
        ]
          .filter(Boolean)
          .join(' ')
        if (thoroughfare) parts.push(thoroughfare)

        const locality = addr.suburb || addr.neighbourhood || addr.residential || addr.quarter || addr.subdivision
        if (locality && !parts.includes(locality)) parts.push(locality)

        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county
        if (city && !parts.includes(city)) parts.push(city)

        const district = addr.state_district
        if (district && district !== city && !parts.includes(district)) parts.push(district)

        const state = addr.state
        if (state && !parts.includes(state)) parts.push(state)

        if (addr.postcode) parts.push(addr.postcode)

        if (parts.length >= 2) {
          return parts.join(', ')
        }
      }

      // 2. Fall back to full display_name if structured parts were too brief
      if (data.display_name && typeof data.display_name === 'string' && data.display_name.trim()) {
        return data.display_name.trim()
      }

      return 'Address unlisted in open registry (Cadastral survey required)'
    } catch (err) {
      clearTimeout(timeoutId)
      const isAbort = err.name === 'AbortError'
      console.warn(`Reverse geocode notice (${lat}, ${lng}):`, isAbort ? 'Request timed out' : err.message)
      // Display a proper fallback message instead of masquerading coordinates as an address
      return isAbort
        ? 'Address lookup timed out (Survey verification required)'
        : 'Address unlisted in open registry (Cadastral survey required)'
    }
  },

  /**
   * Checks whether a given address string is a fallback message rather than a verified locality.
   * @param {string} addr
   * @returns {boolean}
   */
  isAddressFallback: (addr) => {
    if (!addr || typeof addr !== 'string') return true
    const lower = addr.toLowerCase()
    return (
      lower.includes('unlisted in open registry') ||
      lower.includes('timed out') ||
      lower.includes('data unavailable') ||
      lower.includes('unknown address') ||
      lower.startsWith('near ')
    )
  },
}

export default geocodeService
