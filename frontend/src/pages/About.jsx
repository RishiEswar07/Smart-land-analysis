const stack = [
  { group: 'Frontend', items: ['React 18 (Vite)', 'MapLibre GL & Turf.js', 'Tailwind CSS', 'React Router v6', 'Recharts'] },
  { group: 'Backend', items: ['FastAPI (Python 3.11)', 'SQLAlchemy 2.0 (Async)', 'Supabase PostgreSQL', 'PyJWT Authentication', 'ReportLab & openpyxl'] },
  { group: 'Machine Learning', items: ['Scikit-learn', 'Random Forest Classifier', 'Feature Scaling & Encoders', 'Lightweight Inference API'] },
  { group: 'Geospatial Intelligence', items: ['Road & Transit Infrastructure', 'Soil Taxonomy Classification', 'Digital Terrain Elevation', 'Hydrological Flood Modeling', 'Satellite Land Cover'] },
]

const principles = [
  {
    title: 'Explainable, not a black box',
    desc: 'Every suitability assessment details weighted factor contributions (soil, slope, flood risk, infrastructure access, plot requirements) rather than an opaque score.',
  },
  {
    title: 'Real live geospatial telemetry',
    desc: 'Soil taxonomy, terrain elevation, satellite land cover, and 8 categories of nearby facilities with geodesic distances (km) are processed through automated multi-criteria geospatial algorithms.',
  },
  {
    title: 'Honest academic rigor',
    desc: 'Designed as an engineering decision-support tool. It clearly outlines decision factors and serves as a planning aid rather than a replacement for physical geotechnical surveys.',
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
            An AI & GIS-powered decision-support platform for land feasibility analysis and building planning.
            It aggregates live multi-source geospatial data — WRB soil taxonomy, elevation & slope, flood risk,
            and geodesic proximity to infrastructure — to deliver explainable suitability recommendations.
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
          <h2 className="text-xl font-display font-bold text-ink mb-6">Verified Tech Stack</h2>
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
        <h2 className="text-xl font-display font-bold text-ink mb-4">How the Machine Learning Works</h2>
        <p className="text-sm text-slate leading-relaxed max-w-3xl">
          The core ML pipeline utilizes a Scikit-learn Random Forest model trained on engineered
          geotechnical and geospatial features (soil load-bearing capacity, terrain slope gradient,
          flood frequency, infrastructure accessibility, and parcel geometry). The backend exposes a
          low-latency inference service that evaluates feature vectors alongside deterministic zoning
          and minimum plot dimension constraints (Individual House, Apartment, Commercial Building,
          School, Hospital). The models operate strictly in inference mode to guarantee sub-second
          deterministic evaluations.
        </p>
      </section>
    </div>
  )
}
