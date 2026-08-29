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
    return <p className="text-xs text-slate-dim">No risk breakdown available.</p>
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, factor]) => (
        <div key={key}>
          <div className="flex justify-between items-baseline text-xs mb-1.5">
            <span className="text-slate font-medium">
              {factor.label}
              <span className="text-slate-dim font-normal"> · weight {Math.round(factor.weight * 100)}%</span>
            </span>
            <span className="font-semibold text-ink">{factor.score}%</span>
          </div>
          <div className="h-2 rounded-full bg-mist overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${factor.score}%`, backgroundColor: barColor(factor.score) }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
