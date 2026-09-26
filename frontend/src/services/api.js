import axios from 'axios'

/**
 * Resolves the appropriate backend API base URL:
 * 1. Explicit environment variable: VITE_API_BASE_URL (if set)
 * 2. Local development: http://localhost:8000/api/v1 (when on localhost or 127.0.0.1)
 * 3. Production deployment (Vercel / live domain): https://smart-land-analysis.onrender.com/api/v1
 */
const getApiBaseUrl = () => {
  const isBrowser = typeof window !== 'undefined' && window.location
  const host = isBrowser ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === ''

  const envUrl = import.meta.env.VITE_API_BASE_URL
  const cleanEnvUrl = (envUrl && typeof envUrl === 'string') ? envUrl.trim().replace(/\/+$/, '') : ''

  // 1. Local development: use IPv4 loopback directly
  if (isLocal) {
    if (cleanEnvUrl && (cleanEnvUrl.includes('localhost') || cleanEnvUrl.includes('127.0.0.1'))) {
      return cleanEnvUrl
    }
    return 'http://127.0.0.1:8000/api/v1'
  }

  // 2. Production / Deployed environment (Vercel, custom domain):
  // Never use localhost/127.0.0.1 on a public domain
  if (cleanEnvUrl && !cleanEnvUrl.includes('localhost') && !cleanEnvUrl.includes('127.0.0.1')) {
    return cleanEnvUrl
  }

  // Production default Render backend URL
  return 'https://smart-land-analysis.onrender.com/api/v1'
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 35000,
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
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired / invalid — clear it so the UI can react
      localStorage.removeItem('access_token')
    }

    // If response is a Blob (e.g. from failed file download), parse it to extract actual error JSON
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const parsed = JSON.parse(text)
        error.response.data = parsed
      } catch (e) {
        // Blob is not JSON or could not be parsed
      }
    }

    const message = extractErrorMessage(error)
    if (error && typeof error === 'object') {
      error.message = message
    }
    return Promise.reject(error)
  }
)

/**
 * FastAPI error responses come in two shapes:
 *   - Simple:      { detail: "Incorrect email or password." }            (string)
 *   - Validation:  { detail: [{ loc: [...], msg: "...", type: "..." }] } (422 array)
 * This normalizes both into a single human-readable string so callers
 * can always safely render `err.message` directly in the UI.
 */
function extractErrorMessage(error) {
  const isBrowser = typeof window !== 'undefined' && window.location
  const host = isBrowser ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === ''

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

  if (error.response?.data?.message) return error.response.data.message

  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
    if (isLocal) {
      return 'Cannot connect to backend server. Please verify FastAPI is running locally at http://127.0.0.1:8000.'
    }
    return 'Cannot connect to production backend (https://smart-land-analysis.onrender.com). Please verify Render backend is running and DATABASE_URL is configured.'
  }

  return error.message || 'Something went wrong. Please try again.'
}

export default api
