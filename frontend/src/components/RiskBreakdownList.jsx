import { useState } from 'react'
import RiskExplanationModal from './RiskExplanationModal'

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

export default function RiskBreakdownList({ breakdown, landData }) {
  const [modalFactor, setModalFactor] = useState(null)

  let parsed = breakdown
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = {}
    }
  }

  // Filter out non-factor keys like building_suitability_distribution
  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed).filter(([key, val]) => key !== 'building_suitability_distribution' && typeof val === 'object' && !Array.isArray(val))
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
          <div key={key} className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 transition-all hover:border-slate-200">
            <div className="flex justify-between items-baseline text-xs mb-1.5">
              <span className="text-slate-800 font-bold flex items-center gap-1.5">
                {label}
                {weight != null && (
                  <span className="text-slate-400 font-normal">· weight {Math.round(weight * 100)}%</span>
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

            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
              {reason ? (
                <p className="text-[11px] text-slate-500 line-clamp-1 flex-1 pr-2">
                  <strong className="text-slate-600 font-semibold">Basis: </strong>
                  {reason}
                </p>
              ) : <div className="flex-1" />}

              <button
                type="button"
                onClick={() => setModalFactor({ key, data: factorObj })}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline shrink-0"
              >
                <span>🔍 Why this risk?</span>
              </button>
            </div>
          </div>
        )
      })}

      {modalFactor && (
        <RiskExplanationModal
          isOpen={Boolean(modalFactor)}
          onClose={() => setModalFactor(null)}
          factorKey={modalFactor.key}
          factorData={modalFactor.data}
          landData={landData}
        />
      )}
    </div>
  )
}
