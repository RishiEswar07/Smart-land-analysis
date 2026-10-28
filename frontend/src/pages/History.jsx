import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import analysisService from '../services/analysisService'
import reportService from '../services/reportService'
import DetailedLandAnalysisModal from '../components/DetailedLandAnalysisModal'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'

export default function History() {
  const [historyItems, setHistoryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await analysisService.getHistory({ limit: 50, offset: 0 })
      setHistoryItems(res.items || [])
    } catch (err) {
      setError(err.message || 'Failed to fetch analysis history. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleDownloadPdf = async (analysisId, landName) => {
    setDownloadingId(analysisId)
    try {
      const safeName = (landName || 'land').toLowerCase().replace(/[^a-z0-9]/g, '-')
      await reportService.exportPdf(analysisId, `${safeName}-analysis-report.pdf`)
    } catch (err) {
      alert('Could not download PDF report: ' + (err.message || 'Server error'))
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadExcel = async (analysisId, landName) => {
    setDownloadingId(analysisId)
    try {
      const safeName = (landName || 'land').toLowerCase().replace(/[^a-z0-9]/g, '-')
      await reportService.exportExcel(analysisId, `${safeName}-analysis-report.xlsx`)
    } catch (err) {
      alert('Could not download Excel workbook: ' + (err.message || 'Server error'))
    } finally {
      setDownloadingId(null)
    }
  }

  const getScoreBadge = (score) => {
    const s = Math.round(score)
    if (s >= 70) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (s >= 40) return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-rose-100 text-rose-800 border-rose-200'
  }

  const getRiskBadge = (level) => {
    const l = (level || '').toLowerCase()
    if (l === 'low') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (l === 'moderate') return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900">
            Analysis History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review past land suitability assessments, factor breakdowns, and export PDF/Excel reports.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <NavLink
            to="/compare"
            className="btn-outline !px-4 !py-2.5 text-sm font-semibold flex items-center gap-1.5"
          >
            <span>⚖️</span> Compare Parcels
          </NavLink>
          <NavLink
            to="/building-type"
            className="btn-primary !px-5 !py-2.5 text-sm self-start sm:self-auto shrink-0 shadow-sm"
          >
            + New Land Analysis
          </NavLink>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-24 text-center">
          <Loader label="Loading your past land suitability analyses…" />
        </div>
      )}

      {!loading && error && (
        <div className="py-12">
          <ErrorState message={error} onRetry={fetchHistory} />
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && historyItems.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
          <span className="text-5xl block mb-4">🗺️</span>
          <h3 className="text-lg font-bold text-slate-800 mb-2">No past analyses recorded</h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            You haven't run any land suitability evaluations yet. Select a building type and choose your land parcel to get started.
          </p>
          <NavLink to="/building-type" className="btn-primary !px-6 !py-2.5 text-sm inline-block">
            Start Your First Analysis
          </NavLink>
        </div>
      )}

      {/* History Items Grid */}
      {!loading && !error && historyItems.length > 0 && (
        <div className="grid gap-4 md:gap-5">
          {historyItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-blue-300 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-slate-400">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) : 'Recorded'}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    {item.recommended_building_type}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getRiskBadge(item.risk_level)}`}>
                    {item.risk_level} Risk ({Math.round(item.risk_score)}%)
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 truncate">
                  {item.land_name || 'Selected Parcel'}
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  {item.area_sqft ? `${Math.round(item.area_sqft).toLocaleString()} sq.ft` : 'Area not specified'}
                  {item.latitude && item.longitude && (
                    <span className="ml-2 font-mono text-[11px] text-slate-400">
                      ({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})
                    </span>
                  )}
                </p>
              </div>

              {/* Suitability Badge */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Suitability</span>
                  <span className={`inline-block px-3 py-1 rounded-lg text-sm font-black border ${getScoreBadge(item.suitability_score)}`}>
                    {Math.round(item.suitability_score)}%
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-l border-slate-100 pl-4 ml-1">
                  <button
                    onClick={() => setSelectedAnalysisId(item.id)}
                    className="px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors border border-blue-200"
                    title="View detailed factor scores and provenance"
                  >
                    📊 Breakdown
                  </button>
                  <button
                    onClick={() => handleDownloadPdf(item.id, item.land_name)}
                    disabled={downloadingId === item.id}
                    className="px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors border border-slate-200 disabled:opacity-50"
                    title="Download PDF report"
                  >
                    📄 PDF
                  </button>
                  <button
                    onClick={() => handleDownloadExcel(item.id, item.land_name)}
                    disabled={downloadingId === item.id}
                    className="px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors border border-slate-200 disabled:opacity-50"
                    title="Download Excel workbook"
                  >
                    📈 Excel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Modal */}
      {selectedAnalysisId && (
        <DetailedLandAnalysisModal
          isOpen={Boolean(selectedAnalysisId)}
          onClose={() => setSelectedAnalysisId(null)}
          analysisId={selectedAnalysisId}
        />
      )}
    </div>
  )
}
