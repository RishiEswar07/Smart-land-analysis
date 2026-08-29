import { useEffect, useState } from 'react'

/**
 * Gets the user's current browser location once on mount.
 * Falls back to a default center (Madurai, TN) if permission is
 * denied or geolocation is unavailable — keeps the map usable either way.
 */
const DEFAULT_CENTER = { lat: 9.9252, lng: 78.1198 } // Madurai, TN

export default function useGeolocation() {
  const [position, setPosition] = useState(DEFAULT_CENTER)
  const [permissionDenied, setPermissionDenied] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setPermissionDenied(true)
        setPosition(DEFAULT_CENTER)
      },
      { enableHighAccuracy: false, timeout: 5000 }
    )
  }, [])

  return { position, permissionDenied, defaultCenter: DEFAULT_CENTER }
}
