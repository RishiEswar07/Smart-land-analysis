import axios from 'axios'

/**
 * Resolves the appropriate backend API base URL:
 * 1. Explicit environment variable: VITE_API_BASE_URL (if set)
 * 2. Local development: http://localhost:8000/api/v1 (when on localhost or 127.0.0.1)
 * 3. Production deployment (Vercel / live domain): https://smart-land-analysis.onrender.com/api/v1
 */
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '')
  }

  // Check if running in browser on localhost
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return `http://${host}:8000/api/v1`
    }
  }

  // Production default for Vercel and deployed environments
  return 'https://smart-land-analysis.onrender.com/api/v1'
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
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
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join(' | ')
  }

  if (typeof detail === 'string') return detail

  return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
}

export default api
