import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './layouts/MainLayout'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import LandAnalysis from './pages/LandAnalysis'
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import About from './pages/About'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/about" element={<About />} />

          {/* Protected — require login. Unauthenticated visitors are
              redirected to /login and sent back here after signing in. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/land-analysis" element={<LandAnalysis />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          <Route
            path="*"
            element={
              <div className="max-w-xl mx-auto text-center py-32 px-6">
                <p className="text-sm font-semibold text-blue mb-2">404</p>
                <h1 className="text-2xl font-display font-bold text-ink mb-2">Page not found</h1>
                <p className="text-slate text-sm">The page you're looking for doesn't exist.</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
