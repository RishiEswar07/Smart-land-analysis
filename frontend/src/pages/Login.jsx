import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px-1px)] flex items-center justify-center contour-field px-5 py-16">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Logo className="mb-2" />
        </div>

        <div className="card-base p-8">
          <h1 className="text-xl font-display font-bold text-ink text-center">Welcome back</h1>
          <p className="text-sm text-slate text-center mt-1.5 mb-7">
            Log in to analyze land and view your dashboard.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate mb-1.5">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate mb-1.5">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue"
              />
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center disabled:opacity-60">
              {submitting ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          <p className="text-center text-sm text-slate mt-6">
            Don't have an account?{' '}
            <NavLink to="/register" className="text-blue font-semibold hover:underline">
              Sign up
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  )
}
