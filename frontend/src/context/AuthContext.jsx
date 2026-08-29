import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import authService from '../services/authService'

const AuthContext = createContext(null)

/**
 * Lightweight auth state provider. On mount, if a token exists in
 * localStorage (see authService/api.js), it verifies the token is
 * still valid by calling GET /auth/me — this catches expired/stale
 * tokens left over from a previous session instead of trusting the
 * token blindly.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      setLoading(false)
      return
    }
    authService
      .getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => {
        // Token exists but is invalid/expired — clear it so the UI
        // reflects "logged out" rather than a silently broken session.
        authService.logout()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password)
    setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    return authService.register(payload)
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
