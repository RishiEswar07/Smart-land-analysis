import api from './api'

/**
 * Auth API calls. Stores the JWT access token in localStorage on
 * success; api.js automatically attaches it to every future request.
 */
const authService = {
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    if (res.data?.access_token) {
      localStorage.setItem('access_token', res.data.access_token)
    }
    return res.data
  },

  register: async (payload) => {
    const res = await api.post('/auth/register', payload)
    return res.data
  },

  getCurrentUser: () => api.get('/auth/me').then((res) => res.data),

  logout: () => {
    localStorage.removeItem('access_token')
  },

  isAuthenticated: () => Boolean(localStorage.getItem('access_token')),
}

export default authService
