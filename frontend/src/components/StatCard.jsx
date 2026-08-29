/**
 * Compact metric card used across Dashboard and Home stats row.
 * `tone` picks the accent color to keep meaning consistent
 * (green = good/positive, blue = neutral/informational, amber = caution).
 */
const tones = {
  blue: { bg: 'bg-blue-mist', text: 'text-blue-deep', ring: 'ring-blue/15' },
  green: { bg: 'bg-green-light', text: 'text-green-deep', ring: 'ring-green/15' },
  amber: { bg: 'bg-amber-light', text: 'text-amber', ring: 'ring-amber/15' },
  ink: { bg: 'bg-mist', text: 'text-ink', ring: 'ring-line' },
}

export default function StatCard({ icon, label, value, sublabel, tone = 'blue' }) {
  const t = tones[tone] || tones.blue
  return (
    <div className="card-base p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${t.bg} ${t.text} flex items-center justify-center text-lg shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-display font-bold text-ink mt-1 truncate">{value}</p>
        {sublabel && <p className="text-xs text-slate-dim mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}
