import { NavLink } from 'react-router-dom'

const trustStats = [
  { value: '0–100', label: 'Suitability score' },
  { value: '6', label: 'Building types assessed' },
  { value: 'Live', label: 'GIS + flood data' },
]

const features = [
  {
    icon: '🧭',
    title: 'Pinpoint any plot',
    desc: 'Click a location on the map — we auto-fetch elevation, nearby infrastructure, and flood exposure in seconds.',
  },
  {
    icon: '🧠',
    title: 'ML, not guesswork',
    desc: 'A trained Random Forest / XGBoost pipeline scores suitability and recommends the best-fit building type, with reasoning.',
  },
  {
    icon: '🌊',
    title: 'Risk, quantified',
    desc: 'Flood risk from live river-discharge data, environmental exposure, and infrastructure access — each as its own score.',
  },
  {
    icon: '📄',
    title: 'A report you can submit',
    desc: 'Every analysis exports to a clean PDF — suitability breakdown, risk factors, and the recommendation, ready to share.',
  },
]

const steps = [
  { title: 'Drop a pin', desc: 'Select the land on an interactive OpenStreetMap view — no manual coordinate entry needed.' },
  { title: 'Confirm the details', desc: 'Area, soil type, road width, and utilities — most of it pre-filled from live GIS data.' },
  { title: 'Get your verdict', desc: 'A suitability score, recommended building type, and full risk breakdown, generated in seconds.' },
]

export default function Home() {
  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden contour-field">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-16 pb-20 md:pt-24 md:pb-28 grid md:grid-cols-2 gap-14 items-center">
          <div className="animate-fadeUp">
            <span className="label-eyebrow">AI-based decision support for building planning</span>
            <h1 className="mt-5 text-[2.5rem] leading-[1.08] sm:text-5xl md:text-[3.2rem] font-display font-extrabold text-ink tracking-tight">
              Know if a plot is worth building on{' '}
              <span className="bg-brand-gradient bg-clip-text text-transparent">before you buy it.</span>
            </h1>
            <p className="mt-5 text-slate text-base sm:text-lg leading-relaxed max-w-lg">
              Point at a location. We combine soil, elevation, flood history and
              infrastructure access into one clear suitability score — and tell
              you what to build there.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <NavLink to="/land-analysis" className="btn-primary">
                Start Land Analysis
                <span aria-hidden>→</span>
              </NavLink>
              <NavLink to="/about" className="btn-outline">
                How it works
              </NavLink>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {trustStats.map((s) => (
                <div key={s.label}>
                  <p className="font-display font-extrabold text-xl sm:text-2xl text-ink">{s.value}</p>
                  <p className="text-xs text-slate-dim mt-1 leading-snug">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signature visual: Premium glassmorphic radar scanner */}
          <div className="relative animate-fadeUp [animation-delay:150ms] md:justify-self-end w-full max-w-sm mx-auto group">
            {/* Ambient glow behind card */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue to-green opacity-30 blur-2xl group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
            
            <div className="relative rounded-2xl bg-[#0B1121]/90 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_rgba(37,99,235,0.15)] p-6 overflow-hidden">
              {/* Top Bar */}
              <div className="flex items-center justify-between mb-5 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-emerald-400 tracking-wider uppercase">Live Scan Active</span>
                </div>
                <span className="text-[10px] text-white/40 font-mono">LAT:34.05 LNG:-118.24</span>
              </div>

              {/* Radar Map Area */}
              <div className="rounded-xl bg-[#060913] border border-white/5 h-40 relative overflow-hidden mb-6 flex items-center justify-center shadow-inner">
                {/* Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                
                {/* Concentric Radar Circles */}
                <div className="absolute w-64 h-64 border border-blue/20 rounded-full" />
                <div className="absolute w-48 h-48 border border-blue/20 rounded-full" />
                <div className="absolute w-32 h-32 border border-blue/30 rounded-full" />
                <div className="absolute w-16 h-16 border border-emerald-400/40 rounded-full bg-emerald-400/5 animate-pulse" />
                
                {/* Sweeping Radar Line */}
                <div className="absolute top-1/2 left-1/2 w-32 h-32 origin-top-left bg-gradient-to-br from-blue/40 to-transparent blur-sm animate-[spin_4s_linear_infinite]" />
                
                {/* Center Target */}
                <div className="absolute w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,1)] z-10">
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </div>

                {/* Floating Facility Tags */}
                <div className="absolute top-6 left-8 bg-white/10 backdrop-blur-md px-2 py-0.5 rounded text-[9px] text-white/80 font-mono border border-white/10">🏥 Hosp</div>
                <div className="absolute bottom-8 right-6 bg-white/10 backdrop-blur-md px-2 py-0.5 rounded text-[9px] text-white/80 font-mono border border-white/10">🏫 Sch</div>
              </div>

              {/* Data Readout */}
              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-white/50 font-mono uppercase tracking-wider mb-1">Suitability</p>
                  <div className="flex items-end gap-1">
                    <p className="text-3xl font-display font-bold text-white leading-none">92<span className="text-lg text-emerald-400">%</span></p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/5 flex flex-col justify-center">
                  <p className="text-[10px] text-white/50 font-mono uppercase tracking-wider mb-1">AI Recommendation</p>
                  <p className="text-sm font-semibold text-emerald-400 leading-tight">High-Density<br/>Residential</p>
                </div>
              </div>

              {/* Lower Metrics */}
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-2 relative z-10">
                <div className="text-center">
                  <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest mb-1">Flood Risk</p>
                  <p className="text-xs font-semibold text-emerald-400">0.02%</p>
                </div>
                <div className="text-center border-l border-r border-white/10">
                  <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest mb-1">Traffic Flow</p>
                  <p className="text-xs font-semibold text-blue-300">Optimal</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-white/40 font-mono uppercase tracking-widest mb-1">Amenities</p>
                  <p className="text-xs font-semibold text-blue-300">High</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FEATURES ---------------- */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="max-w-xl mb-12">
          <span className="label-eyebrow">What you get</span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-display font-bold text-ink">
            Every plot gets a full feasibility picture
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="card-base p-6 hover:shadow-lift transition-shadow duration-200">
              <div className="w-11 h-11 rounded-xl bg-blue-mist flex items-center justify-center text-xl mb-4">
                {f.icon}
              </div>
              <h3 className="font-display font-semibold text-ink text-base mb-2">{f.title}</h3>
              <p className="text-sm text-slate leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="bg-white border-y border-line">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
          <div className="max-w-xl mb-12">
            <span className="label-eyebrow">Process</span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-display font-bold text-ink">
              From a map click to a build decision
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, idx) => (
              <div key={step.title} className="relative pl-14">
                <span className="absolute left-0 top-0 w-9 h-9 rounded-full bg-ink-gradient text-white text-sm font-display font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <h3 className="font-display font-semibold text-ink mb-1.5">{step.title}</h3>
                <p className="text-sm text-slate leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="rounded-xl2 bg-ink-gradient contour-field-dark px-8 py-14 sm:px-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-white max-w-lg mx-auto">
            Ready to see what your land can become?
          </h2>
          <p className="text-white/60 text-sm mt-3 max-w-md mx-auto">
            No paperwork to start — pick a point on the map and get your first suitability score in under a minute.
          </p>
          <NavLink to="/land-analysis" className="btn-primary mt-7 inline-flex">
            Start Land Analysis
            <span aria-hidden>→</span>
          </NavLink>
        </div>
      </section>
    </div>
  )
}
