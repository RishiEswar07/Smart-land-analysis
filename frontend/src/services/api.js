import axios from 'axios'

/**
 * Central Axios instance for the whole app.
 * Base URL comes from .env (VITE_API_BASE_URL) so it's a single
 * place to change when moving from local -> deployed backend.
 * In development, fall back to the current browser hostname so
 * localhost and 127.0.0.1 both work cleanly.
 */
const defaultApiBaseUrl = `http://${window.location.hostname}:8000/api/v1`

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

// ---- Request interceptor: attach JWT access token if present ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---- Response interceptor: normalize errors, handle 401 ----
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired / invalid — clear it so the UI can react
      localStorage.removeItem('access_token')
    }

    const message = extractErrorMessage(error)
    return Promise.reject({ ...error, message })
  }
)

/**
 * FastAPI error responses come in two shapes:
 *   - Simple:      { detail: "Land not found" }                         (string)
 *   - Validation:  { detail: [{ loc: [...], msg: "...", type: "..." }] } (422 array)
 * This normalizes both into a single human-readable string so callers
 * can always safely render `err.message` directly in the UI.
 */
function extractErrorMessage(error) {
  const detail = error.response?.data?.detail

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        // d.loc is usually like ["body", "land_name"] — show just the field name
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join(' | ')
  }

  if (typeof detail === 'string') return detail

  return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
}

export default api
