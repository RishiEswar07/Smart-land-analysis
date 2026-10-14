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

export default function RiskBreakdownList({ breakdown }) {
  let parsed = breakdown
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = {}
    }
  }

  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed)
    : []

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">No risk breakdown available.</p>
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, factor]) => {
        const factorObj = typeof factor === 'object' && factor !== null ? factor : {}
        const rawScore = typeof factor === 'number' ? factor : (factorObj.score ?? 0)
        const score = Number.isFinite(Number(rawScore)) ? Math.max(0, Math.min(100, Number(rawScore))) : 0
        const label = factorObj.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const weight = factorObj.weight
        const reason = factorObj.why_reason || factorObj.description

        return (
          <div key={key} className="p-2 rounded-lg bg-slate-50/60 border border-slate-100">
            <div className="flex justify-between items-baseline text-xs mb-1.5">
              <span className="text-slate-800 font-bold">
                {label}
                {weight != null && (
                  <span className="text-slate-400 font-normal ml-1">· weight {Math.round(weight * 100)}%</span>
                )}
              </span>
              <span className="font-extrabold text-slate-900">{Math.round(score)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(4, Math.min(100, score))}%`, backgroundColor: barColor(score) }}
              />
            </div>
            {reason && (
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                <strong className="text-slate-600 font-semibold">Why: </strong>
                {reason}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
