import axios from 'axios'

/**
 * Resolves the appropriate backend API base URL:
 * 1. Explicit environment variable: VITE_API_BASE_URL (if set)
 * 2. Local development: http://127.0.0.1:8000/api/v1 (when on localhost or 127.0.0.1)
 * 3. Production deployment (Vercel / live domain): https://smart-land-analysis.onrender.com/api/v1
 */
export const getApiBaseUrl = () => {
  const isBrowser = typeof window !== 'undefined' && window.location
  const host = isBrowser ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === ''

  const envUrl = import.meta.env.VITE_API_BASE_URL
  const cleanEnvUrl = (envUrl && typeof envUrl === 'string') ? envUrl.trim().replace(/\/+$/, '') : ''

  // 1. Explicit env URL takes precedence (if valid for the current environment)
  if (cleanEnvUrl) {
    if (!isLocal && (cleanEnvUrl.includes('localhost') || cleanEnvUrl.includes('127.0.0.1'))) {
      return 'https://smart-land-analysis.onrender.com/api/v1'
    }
    return cleanEnvUrl
  }

  // 2. Local development default
  if (isLocal) {
    return 'http://127.0.0.1:8000/api/v1'
  }

  // 3. Production default Render backend URL
  return 'https://smart-land-analysis.onrender.com/api/v1'
}

/**
 * Resolves the root health-check URL for wake-up pings.
 */
export const getHealthCheckUrl = () => {
  const base = getApiBaseUrl()
  return base.replace(/\/api\/v1\/?$/, '') + '/health'
}

// 60-second timeout accommodates Render free-tier cold starts
const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
})

// ---- Request interceptor: attach JWT access token if present ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Max automatic retries for transient cold-start or connection failures
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

// ---- Response interceptor: retry on cold start / network drop, normalize errors ----
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    if (error.response?.status === 401) {
      // Token expired / invalid — clear it so the UI can react
      localStorage.removeItem('access_token')
    }

    // Determine if this is a transient connection failure (e.g. Render spinning up / 502 / 503 / 504 / timeout)
    const status = error.response?.status
    const isTransientError =
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error' ||
      status === 502 ||
      status === 503 ||
      status === 504

    // Only retry transient cold-start failures (NEVER retry genuine 4xx client errors like 400, 401, 403, 422)
    if (config && isTransientError && (!config._retryCount || config._retryCount < MAX_RETRIES)) {
      config._retryCount = (config._retryCount || 0) + 1
      const backoffMs = RETRY_DELAY_MS * config._retryCount

      console.warn(
        `[API] Transient connection failure (${error.message || status}). Retrying attempt ${config._retryCount}/${MAX_RETRIES} in ${backoffMs}ms...`
      )

      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      return api(config)
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
 * FastAPI error responses come in various shapes.
 * This function preserves genuine backend error details (e.g. "Invalid email or password",
 * "Email already registered", validation errors) while mapping cold-start connection failures
 * to a friendly "Backend is waking up" message.
 */
function extractErrorMessage(error) {
  const isBrowser = typeof window !== 'undefined' && window.location
  const host = isBrowser ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === ''

  const status = error.response?.status

  // 1. Validation Errors (422 array from Pydantic)
  const detail = error.response?.data?.detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join(' | ')
  }

  // 2. Explicit string detail returned by backend (e.g. 400, 401, 404, 409)
  if (typeof detail === 'string') return detail
  if (error.response?.data?.message) return error.response.data.message

  // 3. Status-based fallbacks for genuine HTTP errors
  if (status === 401) {
    return 'Invalid email or password. Please check your credentials.'
  }
  if (status === 403) {
    return 'You do not have permission to perform this action.'
  }
  if (status === 404) {
    return 'The requested resource was not found.'
  }

  const isColdStartOrNetwork =
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    error.message === 'Network Error' ||
    !error.response ||
    status === 502 ||
    status === 503 ||
    status === 504

  if (isColdStartOrNetwork) {
    if (isLocal) {
      return 'Cannot connect to backend server. Please verify FastAPI is running locally at http://127.0.0.1:8000.'
    }
    return 'Backend is waking up. Please wait a few seconds and try again.'
  }

  return error.message || 'An unexpected error occurred. Please try again.'
}

/**
 * Lightweight background ping to wake up the Render container proactively.
 */
export const pingBackend = async () => {
  try {
    const healthUrl = getHealthCheckUrl()
    await axios.get(healthUrl, { timeout: 15000 })
  } catch (err) {
    // Proactive background ping - non-blocking
  }
}

/**
 * Checks backend health status. Returns true if healthy/200 OK, false otherwise.
 */
export const checkBackendHealth = async () => {
  const primaryUrl = getHealthCheckUrl()
  const candidates = [
    primaryUrl,
    getApiBaseUrl() + '/health',
    'https://smart-land-analysis.onrender.com/health',
  ]

  // Remove duplicates
  const uniqueUrls = [...new Set(candidates)]

  for (const url of uniqueUrls) {
    try {
      const res = await axios.get(url, { timeout: 4000 })
      if (res.status === 200) {
        return true
      }
    } catch (err) {
      // Continue to next candidate
    }
  }
  return false
}

export default api


