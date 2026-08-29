import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Loader from './Loader'

/**
 * Wraps protected routes (Land Analysis, Dashboard). If the auth check
 * is still in flight, shows a loader instead of flashing a redirect.
 * If not authenticated, redirects to /login and remembers where the
 * user was trying to go (via location state) so Login can send them
 * back after a successful sign-in.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Loader label="Checking your session…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
