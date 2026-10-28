import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import landService from '../services/landService'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'

const BUILDING_TYPES = [
  { id: 'Individual House', label: 'Individual House', icon: '🏡', desc: 'Low-rise residential (G+2 / S+3)' },
  { id: 'Apartment', label: 'Apartment', icon: '🏢', desc: 'Multi-dwelling mid-rise (up to 18.3m)' },
  { id: 'Commercial Building', label: 'Commercial Building', icon: '🏬', desc: 'Retail, offices & complexes' },
  { id: 'Hospital', label: 'Hospital', icon: '🏥', desc: 'Healthcare & emergency facilities' },
  { id: 'School', label: 'School', icon: '🏫', desc: 'Educational institutions' },
]

export default function CompareParcels() {
  const [lands, setLands] = useState([])
  const [loadingLands, setLoadingLands] = useState(true)
  const [errorLands, setErrorLands] = useState(null)

  const [selectedIds, setSelectedIds] = useState([])
  const [targetBuildingType, setTargetBuildingType] = useState('Individual House')

  const [comparing, setComparing] = useState(false)
  const [comparisonError, setComparisonError] = useState(null)
  const [comparisonData, setComparisonData] = useState(null)

  // Fetch user's registered lands
  const fetchUserLands = async () => {
    setLoadingLands(true)
    setErrorLands(null)
    try {
      const res = await landService.getLands({ limit: 100 })
      setLands(res.items || [])
      // Auto-select first two if available and none selected
      if (res.items && res.items.length >= 2 && selectedIds.length === 0) {
        setSelectedIds([res.items[0].id, res.items[1].id])
      }
    } catch (err) {
      setErrorLands(err.message || 'Failed to load your land parcels.')
    } finally {
      setLoadingLands(false)
    }
  }

  useEffect(() => {
    fetchUserLands()
  }, [])

  const handleToggleParcel = (landId) => {
    if (selectedIds.includes(landId)) {
      setSelectedIds(selectedIds.filter((id) => id !== landId))
    } else {
      if (selectedIds.length >= 3) {
        alert('You can compare a maximum of 3 parcels at a time.')
        return
      }
      setSelectedIds([...selectedIds, landId])
    }
    // Invalidate stale comparison data when selection changes
    setComparisonData(null)
  }

  const handleRunComparison = async (overrideType = null) => {
    const bType = overrideType || targetBuildingType
    if (selectedIds.length < 2) {
      setComparisonError('Please select at least 2 land parcels to compare.')
      return
    }
    if (selectedIds.length > 3) {
      setComparisonError('A maximum of 3 parcels can be compared simultaneously.')
      return
    }

    setComparing(true)
    setComparisonError(null)
    try {
      const res = await landService.compareParcels(selectedIds, bType)
      setComparisonData(res)
    } catch (err) {
      setComparisonError(err.response?.data?.detail || err.message || 'Comparison evaluation failed.')
    } finally {
      setComparing(false)
    }
  }

  const handleBuildingTypeChange = (bType) => {
    setTargetBuildingType(bType)
    if (selectedIds.length >= 2) {
      handleRunComparison(bType)
    }
  }

  // Export comparison table as CSV
  const handleExportCsv = () => {
    if (!comparisonData || !comparisonData.parcels) return

    const parcels = comparisonData.parcels
    const headers = ['Metric', ...parcels.map((p) => p.land_name)]

    const rows = [
      ['Target Building Type', ...parcels.map(() => comparisonData.target_building_type)],
      ['Address', ...parcels.map((p) => `"${p.address}"`)],
      ['Area (sq.ft)', ...parcels.map((p) => p.area_sqft)],
      ['Area (cents)', ...parcels.map((p) => p.area_breakdown?.cents || 'N/A')],
      ['Area (acres)', ...parcels.map((p) => p.area_breakdown?.acres || 'N/A')],
      ['Road Width (ft)', ...parcels.map((p) => p.road_width_ft || 'N/A')],
      ['Road Adequacy (TNCDBR)', ...parcels.map((p) => p.planning_rules?.road_adequacy_status || 'N/A')],
      ['Overall Suitability Score (%)', ...parcels.map((p) => p.suitability_score ?? 'Not Analyzed')],
      ['Target Building Suitability (%)', ...parcels.map((p) => p.target_building_suitability_score ?? 'N/A')],
      ['Overall Risk Score (%)', ...parcels.map((p) => p.overall_risk_score ?? 'N/A')],
      ['Flood Risk Level', ...parcels.map((p) => p.flood_risk_level ?? 'N/A')],
      ['Soil Type', ...parcels.map((p) => p.soil_type || 'N/A')],
      ['Water Connection', ...parcels.map((p) => (p.water_availability ? 'Yes' : 'No'))],
      ['Electricity Connection', ...parcels.map((p) => (p.electricity_availability ? 'Yes' : 'No'))],
      ['TNCDBR Base FSI', ...parcels.map((p) => p.planning_rules?.base_fsi || 'N/A')],
      ['Max Gross Floor Area (sq.ft)', ...parcels.map((p) => p.planning_rules?.theoretical_max_floor_area_sqft || 'N/A')],
      ['Front Setback (ft)', ...parcels.map((p) => p.planning_rules?.front_setback_ft?.toFixed(1) || 'N/A')],
      ['Rear Setback (ft)', ...parcels.map((p) => p.planning_rules?.rear_setback_ft?.toFixed(1) || 'N/A')],
      ['Max Building Height (ft)', ...parcels.map((p) => p.planning_rules?.max_height_ft?.toFixed(1) || 'N/A')],
      ['Data Completeness (%)', ...parcels.map((p) => `${p.data_completeness_pct}%`)],
    ]

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `parcel_comparison_${targetBuildingType.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loadingLands) {
    return <Loader label="Loading your land parcels..." />
  }

  if (errorLands) {
    return <ErrorState message={errorLands} onRetry={fetchUserLands} />
  }

  // Insufficient Parcels Empty State (< 2 lands registered)
  if (lands.length < 2) {
    return (
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-16 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5 shadow-sm border border-blue-100">
          ⚖️
        </div>
        <span className="label-eyebrow">Multi-Parcel Comparison</span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-display font-bold text-ink">
          At least 2 land parcels are required
        </h1>
        <p className="text-slate text-sm max-w-lg mx-auto mt-3 leading-relaxed">
          You currently have <strong className="text-ink">{lands.length}</strong> parcel registered in your account.
          To compare locations side-by-side across suitability, road adequacy, and statutory building rules, please add and analyze at least two parcels.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/land-analysis"
            className="btn-primary !px-6 !py-3 flex items-center gap-2 shadow-sm font-semibold"
          >
            <span>➕</span> Add New Land Parcel
          </Link>
          <Link to="/dashboard" className="btn-outline !px-6 !py-3 font-semibold">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Prepare chart data for Recharts
  const chartData = comparisonData?.parcels?.map((p) => ({
    name: p.land_name.length > 14 ? p.land_name.slice(0, 14) + '…' : p.land_name,
    'Overall Suitability': p.suitability_score || 0,
    [`${comparisonData.target_building_type} Score`]: p.target_building_suitability_score || 0,
    'Infrastructure': p.infrastructure_score || 0,
    'Completeness': p.data_completeness_pct || 0,
  }))

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 animate-fadeUp">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-line mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-eyebrow">Decision Support</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
              TNCDBR 2019 Integrated
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-ink mt-2">
            Multi-Parcel Comparison & Ranking
          </h1>
          <p className="text-sm text-slate mt-1 max-w-2xl">
            Compare 2 or 3 saved parcels side-by-side to evaluate building suitability, road width compliance,
            FSI potential, and environmental stability tailored to your planned construction type.
          </p>
        </div>

        {comparisonData && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCsv}
              className="btn-outline !px-4 !py-2 !text-xs font-semibold flex items-center gap-1.5"
            >
              <span>📥</span> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="btn-outline !px-4 !py-2 !text-xs font-semibold flex items-center gap-1.5"
            >
              <span>🖨️</span> Print Summary
            </button>
          </div>
        )}
      </div>

      {/* ---------------- 1. CONFIGURATION SECTION ---------------- */}
      <div className="bg-white rounded-2xl border border-line p-6 shadow-xs mb-8">
        {/* Step A: Building Type Selection */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            1. Select Target Building Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {BUILDING_TYPES.map((bt) => {
              const isSelected = targetBuildingType === bt.id
              return (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => handleBuildingTypeChange(bt.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">{bt.icon}</span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-ink leading-tight">{bt.label}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{bt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step B: Parcel Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Choose Parcels to Compare ({selectedIds.length} of 3 selected)
            </label>
            <span className="text-xs text-slate-500">
              Minimum 2, maximum 3 parcels
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-6">
            {lands.map((land) => {
              const isChecked = selectedIds.includes(land.id)
              return (
                <div
                  key={land.id}
                  onClick={() => handleToggleParcel(land.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isChecked
                      ? 'border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-400'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by parent div click
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <h3 className="text-sm font-bold text-ink truncate">{land.land_name}</h3>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {land.land_type}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 truncate mt-1 pl-6">{land.address}</p>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs pl-6">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Area</span>
                      <span className="font-semibold text-ink">
                        {land.area_sqft ? `${Math.round(land.area_sqft).toLocaleString()} sq.ft` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Road Width</span>
                      <span className="font-semibold text-ink">
                        {land.road_width ? `${land.road_width} ft` : 'Unspecified'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {selectedIds.length < 2 && '⚠️ Select at least 2 parcels to activate comparison.'}
              {selectedIds.length >= 2 && `Ready to evaluate ${selectedIds.length} parcels for ${targetBuildingType}.`}
            </p>
            <button
              onClick={() => handleRunComparison()}
              disabled={selectedIds.length < 2 || comparing}
              className="btn-primary !px-7 !py-2.5 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {comparing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Comparing Parcels...
                </>
              ) : (
                <>
                  <span>📊</span> Compare {selectedIds.length} Parcels
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {comparisonError && (
        <div className="p-4 mb-8 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-2.5">
          <span className="text-lg">⚠️</span>
          <div>
            <strong className="font-semibold">Comparison Notice: </strong>
            <span>{comparisonError}</span>
          </div>
        </div>
      )}

      {/* ---------------- 2. COMPARISON RESULTS ---------------- */}
      {comparisonData && (
        <div className="space-y-8 animate-fadeUp">
          {/* Executive Recommendation Banner */}
          <div
            className={`p-6 sm:p-7 rounded-2xl border shadow-xs ${
              comparisonData.summary.winner_parcel_id
                ? 'bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/40 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-xs shrink-0 ${
                    comparisonData.summary.winner_parcel_id
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {comparisonData.summary.winner_parcel_id ? '🏆' : '⚖️'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Recommendation Verdict
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                        comparisonData.summary.recommendation_confidence === 'High'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : comparisonData.summary.recommendation_confidence === 'Moderate'
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {comparisonData.summary.recommendation_confidence} Confidence
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-display font-extrabold text-ink mt-1">
                    {comparisonData.summary.verdict}
                  </h2>
                </div>
              </div>

              {comparisonData.summary.winner_parcel_name && (
                <div className="bg-white/80 backdrop-blur-xs px-4 py-2.5 rounded-xl border border-emerald-200 text-right shrink-0">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Top Candidate</span>
                  <span className="text-base font-extrabold text-emerald-700">
                    {comparisonData.summary.winner_parcel_name}
                  </span>
                </div>
              )}
            </div>

            {/* Comparison Insights */}
            {comparisonData.summary.comparison_insights?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-200/80">
                <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Key Evaluation Insights:</h4>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {comparisonData.summary.comparison_insights.map((ins, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✔</span>
                      <span>{ins}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Ranking Cards Overview */}
          <div>
            <h3 className="text-base font-bold text-ink mb-4 flex items-center gap-2">
              <span>🏅</span> Parcel Rankings for {comparisonData.target_building_type}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {comparisonData.rankings.map((rk) => {
                const isWinner = rk.rank === 1 && rk.is_recommended
                return (
                  <div
                    key={rk.parcel_id}
                    className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                      isWinner
                        ? 'bg-white border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm'
                        : 'bg-white border-line shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              rk.rank === 1
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : rk.rank === 2
                                ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                            }`}
                          >
                            #{rk.rank}
                          </span>
                          <h4 className="text-base font-bold text-ink truncate">{rk.land_name}</h4>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            rk.status === 'Top Recommendation'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : rk.status.includes('Deficient')
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {rk.status}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 mb-4 pb-3 border-b border-slate-100">
                        <span className="text-2xl font-extrabold text-ink">{rk.composite_score}%</span>
                        <span className="text-xs text-slate-400">composite match score</span>
                      </div>

                      {/* Strengths */}
                      <div className="mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1">
                          Advantages
                        </span>
                        {rk.key_strengths.length > 0 ? (
                          <ul className="space-y-1 text-xs text-slate-600">
                            {rk.key_strengths.map((str, sIdx) => (
                              <li key={sIdx} className="flex items-start gap-1.5 leading-snug">
                                <span className="text-emerald-500 font-bold">✓</span>
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No standout advantages recorded.</p>
                        )}
                      </div>

                      {/* Weaknesses */}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block mb-1">
                          Risks & Regulatory Notes
                        </span>
                        {rk.key_weaknesses.length > 0 ? (
                          <ul className="space-y-1 text-xs text-slate-600">
                            {rk.key_weaknesses.map((w, wIdx) => (
                              <li key={wIdx} className="flex items-start gap-1.5 leading-snug">
                                <span className="text-rose-500 font-bold">⚠️</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No significant risks identified.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                      <strong>Planning Summary:</strong> {rk.regulatory_summary}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Comparative Metrics Chart */}
          {chartData && (
            <div className="bg-white rounded-2xl border border-line p-6 shadow-xs">
              <h3 className="text-base font-bold text-ink mb-1 flex items-center gap-2">
                <span>📊</span> Comparative Factor Scores (0–100%)
              </h3>
              <p className="text-xs text-slate-500 mb-6">
                Normalized benchmark comparison across overall suitability, building suitability, infrastructure readiness, and data completeness.
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '0.75rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="Overall Suitability" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={`${comparisonData.target_building_type} Score`} fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Infrastructure" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Completeness" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ---------------- 3. DETAILED COMPARISON MATRIX ---------------- */}
          <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-xs">
            <div className="p-5 border-b border-line bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">Side-by-Side Comparison Matrix</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed parameter evaluation across GIS data, suitability telemetry, and TNCDBR 2019 building planning rules.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] w-1/4">
                      Metric / Parameter
                    </th>
                    {comparisonData.parcels.map((p) => (
                      <th key={p.land_id} className="py-3 px-4 font-bold text-sm text-ink">
                        {p.land_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Category: General Attributes */}
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td colSpan={comparisonData.parcels.length + 1} className="py-2 px-4 uppercase text-[10px] tracking-wider">
                      📍 General & Plot Attributes
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Address / Location</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.address}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Plot Area</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 font-semibold text-ink">
                        {p.area_breakdown?.formatted_display || `${p.area_sqft.toLocaleString()} sq.ft`}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Zoning / Land Type</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.land_type}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Soil Classification</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.soil_type || 'Unspecified'}
                      </td>
                    ))}
                  </tr>

                  {/* Category: Suitability & Risks */}
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td colSpan={comparisonData.parcels.length + 1} className="py-2 px-4 uppercase text-[10px] tracking-wider">
                      📈 AI Suitability & Environmental Risk
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Overall Suitability Score</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4">
                        {p.suitability_score !== null ? (
                          <span className="font-bold text-sm text-blue-700">{p.suitability_score}%</span>
                        ) : (
                          <span className="text-slate-400 italic">Not Analyzed</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">
                      {comparisonData.target_building_type} Specific Suitability
                    </td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4">
                        {p.target_building_suitability_score !== null ? (
                          <span className="font-bold text-sm text-emerald-700">
                            {p.target_building_suitability_score}%
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">N/A</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Overall Risk Level</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4">
                        {p.overall_risk_level ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              p.overall_risk_level === 'Low'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.overall_risk_level === 'Moderate'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {p.overall_risk_level} ({p.overall_risk_score}%)
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">N/A</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Hydrological Flood Risk</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.flood_risk_level || 'Telemetry Unavailable'}
                      </td>
                    ))}
                  </tr>

                  {/* Category: Access & Infrastructure */}
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td colSpan={comparisonData.parcels.length + 1} className="py-2 px-4 uppercase text-[10px] tracking-wider">
                      🚗 Access Corridor & Infrastructure
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Abutting Road Width</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 font-semibold text-ink">
                        {p.road_width_ft ? `${p.road_width_ft} ft` : 'Unspecified'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Road Adequacy ({comparisonData.target_building_type})</td>
                    {comparisonData.parcels.map((p) => {
                      const status = p.planning_rules?.road_adequacy_status
                      return (
                        <td key={p.land_id} className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              status === 'adequate' || status === 'surplus'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : status === 'deficient'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {status || 'Unknown'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Utilities (Water & Power)</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.water_availability && p.electricity_availability
                          ? '✅ Water & Power Available'
                          : p.water_availability || p.electricity_availability
                          ? '⚠️ Partial Utility Availability'
                          : '❌ Unconfirmed Utilities'}
                      </td>
                    ))}
                  </tr>

                  {/* Category: TNCDBR 2019 Building Rules */}
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td colSpan={comparisonData.parcels.length + 1} className="py-2 px-4 uppercase text-[10px] tracking-wider">
                      🏛️ TNCDBR 2019 Statutory Planning Rules
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Base FSI</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 font-semibold text-ink">
                        {p.planning_rules?.base_fsi || '2.0'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Theoretical Max Floor Area</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800 font-semibold">
                        {p.planning_rules?.theoretical_max_floor_area_sqft
                          ? `${Math.round(p.planning_rules.theoretical_max_floor_area_sqft).toLocaleString()} sq.ft`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Mandatory Front Setback</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.planning_rules?.front_setback_ft
                          ? `${p.planning_rules.front_setback_ft.toFixed(1)} ft`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Rear / Side Setbacks</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.planning_rules?.rear_setback_ft
                          ? `Rear: ${p.planning_rules.rear_setback_ft.toFixed(1)} ft | Sides: ${p.planning_rules.side_setback1_ft?.toFixed(1) || '—'} ft`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Max Permissible Height</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-800">
                        {p.planning_rules?.max_height_ft
                          ? `${p.planning_rules.max_height_ft.toFixed(1)} ft`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Permissible Floors</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-700 text-[11px]">
                        {p.planning_rules?.permissible_floors || 'Standard residential'}
                      </td>
                    ))}
                  </tr>

                  {/* Category: Data Completeness */}
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td colSpan={comparisonData.parcels.length + 1} className="py-2 px-4 uppercase text-[10px] tracking-wider">
                      🔍 Data Completeness & Quality
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Data Completeness</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            p.data_completeness_pct >= 85
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.data_completeness_pct >= 60
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.data_completeness_pct}% ({p.data_completeness_status})
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-slate-600">Missing Inputs</td>
                    {comparisonData.parcels.map((p) => (
                      <td key={p.land_id} className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {p.missing_data_items?.length > 0 ? p.missing_data_items.join(', ') : 'None (Complete)'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Statutory Disclaimer Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-700 font-semibold">Statutory Disclaimer: </strong>
            {comparisonData.summary.disclaimer}
          </div>
        </div>
      )}
    </div>
  )
}
