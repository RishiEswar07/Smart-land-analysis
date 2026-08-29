const riskStyles = {
  Low: { bg: 'bg-green-light', text: 'text-green-deep', dot: 'bg-green' },
  Medium: { bg: 'bg-amber-light', text: 'text-amber', dot: 'bg-amber' },
  Moderate: { bg: 'bg-amber-light', text: 'text-amber', dot: 'bg-amber' },
  High: { bg: 'bg-danger-light', text: 'text-danger', dot: 'bg-danger' },
  Unknown: { bg: 'bg-mist', text: 'text-slate-dim', dot: 'bg-slate-dim' },
}

export default function RiskCard({ title, level = 'Unknown', description, icon }) {
  // No silent fallback to "Low" for an unrecognized/missing level — that
  // would misrepresent unknown risk as safe. Anything not in the map
  // (including a genuinely missing value) renders as a neutral "Unknown".
  const s = riskStyles[level] || riskStyles.Unknown
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <h4 className="text-sm font-display font-semibold text-ink">{title}</h4>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {level} {level !== 'Unknown' ? 'Risk' : ''}
        </span>
      </div>
      {description && <p className="text-xs text-slate leading-relaxed">{description}</p>}
    </div>
  )
}
