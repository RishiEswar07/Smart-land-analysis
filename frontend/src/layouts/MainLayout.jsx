import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

/**
 * Shared shell for every page: sticky navbar + routed page content + footer.
 */
export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-mist">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
