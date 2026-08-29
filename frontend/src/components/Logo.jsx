/**
 * Shared brand mark: a stylized contour "hill" with a location pin —
 * ties the identity directly to land survey / GIS visuals rather than
 * a generic abstract icon. Reused in Navbar and Footer.
 */
export default function Logo({ variant = 'dark', className = '' }) {
  const textColor = variant === 'light' ? 'text-white' : 'text-ink'

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="17" cy="17" r="17" fill="url(#logoGrad)" />
        <path d="M6 21 Q11 15 17 19 T28 15" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        <path d="M6 25 Q11 20 17 23 T28 19" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
        <path d="M17 8 C14 8 12 10.5 12 13.2 C12 16.8 17 22 17 22 C17 22 22 16.8 22 13.2 C22 10.5 20 8 17 8Z" fill="white" />
        <circle cx="17" cy="13" r="2.4" fill="#16A34A" />
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#16A34A" />
          </linearGradient>
        </defs>
      </svg>
      <span className={`font-display font-bold text-[15px] leading-tight ${textColor}`}>
        Smart Land<br className="hidden sm:block" /> Analysis
      </span>
    </div>
  )
}
