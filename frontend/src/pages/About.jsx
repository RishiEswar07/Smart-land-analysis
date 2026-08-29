const stack = [
  { group: 'Frontend', items: ['React (Vite)', 'Tailwind CSS', 'React Router', 'Recharts', 'React Leaflet'] },
  { group: 'Backend', items: ['FastAPI (async)', 'SQLAlchemy 2.0', 'PostgreSQL', 'JWT authentication'] },
  { group: 'AI / ML', items: ['Scikit-learn', 'XGBoost', 'Random Forest'] },
  { group: 'Data sources', items: ['OpenStreetMap Overpass API', 'Open-Elevation API', 'Open-Meteo Flood API'] },
]

const principles = [
  {
    title: 'Explainable, not a black box',
    desc: 'Every score comes with the reasoning behind it — which factors pushed it up or down — instead of a bare number.',
  },
  {
    title: 'Real data where it exists',
    desc: 'Location, elevation, nearby infrastructure and flood exposure are pulled live from public GIS and hydrology APIs.',
  },
  {
    title: 'Honest about its limits',
    desc: "This is a decision-support tool, not a replacement for a licensed civil engineer's site survey.",
  },
]

export default function About() {
  return (
    <div>
      <section className="contour-field border-b border-line">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-16 text-center">
          <span className="label-eyebrow">About the project</span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-display font-bold text-ink">
            Smart Land Analysis Platform
          </h1>
          <p className="mt-4 text-slate leading-relaxed max-w-2xl mx-auto">
            An AI-based decision support system for building planning, built as a final-year
            engineering project. It turns scattered land data — soil, elevation, flood history,
            infrastructure access — into one clear, explainable suitability verdict.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
        <h2 className="text-xl font-display font-bold text-ink mb-6">Design principles</h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {principles.map((p) => (
            <div key={p.title} className="card-base p-6">
              <h3 className="font-display font-semibold text-ink text-sm mb-2">{p.title}</h3>
              <p className="text-sm text-slate leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
          <h2 className="text-xl font-display font-bold text-ink mb-6">Tech stack</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {stack.map((s) => (
              <div key={s.group}>
                <p className="text-xs font-semibold text-blue-deep uppercase tracking-wide mb-3">{s.group}</p>
                <ul className="space-y-2">
                  {s.items.map((item) => (
                    <li key={item} className="text-sm text-slate flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-green" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
        <h2 className="text-xl font-display font-bold text-ink mb-4">How the AI works, briefly</h2>
        <p className="text-sm text-slate leading-relaxed max-w-3xl">
          A Random Forest / XGBoost regressor scores suitability (0–100) and a companion
          classifier recommends the best-fit building type from six categories — individual
          house, apartment, school, hospital, commercial, or factory. Both are trained offline
          on a feature-engineered dataset combining real GIS data with domain-rule-bootstrapped
          labels, then served through a lightweight FastAPI inference endpoint — the model
          never trains live, it only predicts.
        </p>
      </section>
    </div>
  )
}
