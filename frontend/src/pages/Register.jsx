import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

export default function Register() {
  const { register, login } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(form)
      // Registration doesn't auto-issue a token on the backend, so log
      // in immediately after so the user doesn't have to type their
      // details twice.
      await login(form.email, form.password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
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
          <h1 className="text-xl font-display font-bold text-ink text-center">Create your account</h1>
          <p className="text-sm text-slate text-center mt-1.5 mb-7">
            Start analyzing land suitability in minutes.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate mb-1.5">Full name</span>
              <input
                type="text"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Rishi Eswar"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate mb-1.5">Email</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-slate mb-1.5">Password</span>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue"
              />
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center disabled:opacity-60">
              {submitting ? 'Creating account…' : 'Sign Up'}
            </button>
          </form>

          <p className="text-center text-sm text-slate mt-6">
            Already have an account?{' '}
            <NavLink to="/login" className="text-blue font-semibold hover:underline">
              Log in
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  )
}
