/**
 * Renders the explainable per-factor risk breakdown returned by the
 * backend (`result.risk_breakdown`), e.g.:
 *   { flood_risk: { label, score, weight }, accessibility_risk: {...}, ... }
 * Each factor is 0-100 where HIGHER = MORE RISK, matching risk_score's polarity.
 */
function barColor(score) {
  if (score <= 30) return '#16A34A'
  if (score <= 60) return '#D97706'
  return '#DC2626'
}

export default function RiskBreakdownList({ breakdown = {} }) {
  const entries = Object.entries(breakdown)

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">No risk breakdown available.</p>
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, factor]) => (
        <div key={key} className="p-2 rounded-lg bg-slate-50/60 border border-slate-100">
          <div className="flex justify-between items-baseline text-xs mb-1.5">
            <span className="text-slate-800 font-bold">
              {factor.label}
              {factor.weight && (
                <span className="text-slate-400 font-normal ml-1">· weight {Math.round(factor.weight * 100)}%</span>
              )}
            </span>
            <span className="font-extrabold text-slate-900">{factor.score}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(4, Math.min(100, factor.score))}%`, backgroundColor: barColor(factor.score) }}
            />
          </div>
          {(factor.why_reason || factor.description) && (
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              <strong className="text-slate-600 font-semibold">Why: </strong>
              {factor.why_reason || factor.description}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
