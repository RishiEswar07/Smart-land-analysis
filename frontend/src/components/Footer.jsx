import { NavLink } from 'react-router-dom'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="bg-ink-gradient text-white">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <Logo variant="light" />
          <p className="mt-4 text-sm text-white/60 leading-relaxed max-w-xs">
            AI-based decision support for building planning — turning raw land
            data into a clear, explainable suitability verdict.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-display font-semibold text-white/90 mb-4">Platform</h4>
          <ul className="space-y-2.5 text-sm text-white/60">
            <li><NavLink to="/land-analysis" className="hover:text-white transition-colors">Land Analysis</NavLink></li>
            <li><NavLink to="/dashboard" className="hover:text-white transition-colors">Dashboard</NavLink></li>
            <li><NavLink to="/reports" className="hover:text-white transition-colors">Reports</NavLink></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display font-semibold text-white/90 mb-4">Data sources</h4>
          <ul className="space-y-2.5 text-sm text-white/60">
            <li>OpenStreetMap (Overpass)</li>
            <li>Open-Elevation API</li>
            <li>Open-Meteo Flood API</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display font-semibold text-white/90 mb-4">About</h4>
          <ul className="space-y-2.5 text-sm text-white/60">
            <li><NavLink to="/about" className="hover:text-white transition-colors">Project overview</NavLink></li>
            <li>Final Year B.Tech IT Project</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/45">
          <span>&copy; {new Date().getFullYear()} Smart Land Analysis Platform. Built for academic research.</span>
          <span>FastAPI · PostgreSQL · React · Scikit-learn</span>
        </div>
      </div>
    </footer>
  )
}
