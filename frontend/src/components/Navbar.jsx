import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Home' },
  { to: '/land-analysis', label: 'Land Analysis' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/reports', label: 'Reports' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    setOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-line">
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
        <NavLink to="/" onClick={() => setOpen(false)}>
          <Logo />
        </NavLink>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    isActive ? 'bg-blue-mist text-blue-deep' : 'text-slate hover:text-ink'
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Desktop auth area */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="text-sm text-slate">
                Hi, <span className="font-semibold text-ink">{user?.name?.split(' ')[0]}</span>
              </span>
              <button onClick={handleLogout} className="btn-outline !px-5 !py-2.5 !text-sm">
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="btn-outline !px-5 !py-2.5 !text-sm">
                Log in
              </NavLink>
              <NavLink to="/land-analysis" className="btn-primary !px-5 !py-2.5 !text-sm">
                Start Analysis
              </NavLink>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-full border border-line"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
        >
          <span className="sr-only">Menu</span>
          {open ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-line bg-white px-5 py-4 flex flex-col gap-1 animate-fadeUp">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `px-4 py-3 rounded-lg text-sm font-semibold ${
                  isActive ? 'bg-blue-mist text-blue-deep' : 'text-slate'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}

          {isAuthenticated ? (
            <>
              <div className="px-4 py-2 text-sm text-slate">
                Signed in as <span className="font-semibold text-ink">{user?.name}</span>
              </div>
              <button onClick={handleLogout} className="btn-outline mt-1 justify-center">
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={() => setOpen(false)} className="btn-outline mt-2 justify-center">
                Log in
              </NavLink>
              <NavLink to="/land-analysis" onClick={() => setOpen(false)} className="btn-primary mt-2 justify-center">
                Start Analysis
              </NavLink>
            </>
          )}
        </div>
      )}
    </header>
  )
}
