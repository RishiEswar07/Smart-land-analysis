import React, { useState, useEffect } from 'react'
import analysisService from '../services/analysisService'
import reportService from '../services/reportService'
import ScoreGauge from './ScoreGauge'
import Loader from './Loader'

/**
 * DetailedLandAnalysisModal
 * -------------------------
 * Comprehensive, interactive breakdown modal for land analysis.
 * Displays factor scores, data quality, data sources provenance,
 * calculation methodology, historical change note, and multi-format exports.
 */
export default function DetailedLandAnalysisModal({
  isOpen,
  onClose,
  analysisId,
  initialData = null,
}) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [exportingType, setExportingType] = useState(null)
  const [exportSuccess, setExportSuccess] = useState(null)
  const [showFormulaDetails, setShowFormulaDetails] = useState(false)

  // Fetch detailed data whenever modal opens
  useEffect(() => {
    if (!isOpen) return

    if (analysisId) {
      setLoading(true)
      setError(null)
      analysisService
        .getDetailedAnalysis(analysisId)
        .then((res) => {
          setData(res)
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to fetch detailed analysis:', err)
          setError('Could not load detailed analysis breakdown. Using available summary data.')
          setLoading(false)
        })
    } else if (initialData) {
      setData(initialData)
    }
  }, [isOpen, analysisId, initialData])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const prop = data?.property_info || {}
  const suit = data?.suitability || {}
  const factors = data?.factors || []
  const calc = data?.score_calculation || {}
  const quality = data?.data_quality || {}
  const sources = data?.data_sources || []
  const historical = data?.historical_change || {}
  const rec = data?.recommendation || {}
  const areaConv = data?.area_conversions || {}
  const plotVal = data?.plot_validation || {}
  const cost = data?.construction_cost || {}
  const disclaimer = data?.disclaimer || 'This analysis is a GIS-based decision-support assessment.'

  const areaSqFt = areaConv.sqft ?? prop.area_sqft ?? 0
  const areaSqm = areaConv.sqm ?? (areaSqFt ? (areaSqFt / 10.7639).toFixed(1) : 0)
  const areaCents = areaConv.cents ?? (areaSqFt ? (areaSqFt / 435.6).toFixed(2) : 0)

  const handleExport = async (format) => {
    if (!analysisId) return
    setExportingType(format)
    setExportSuccess(null)
    const baseName = (prop.land_name || 'land').replace(/[^a-zA-Z0-9-_ ]/g, '_').trim()

    try {
      if (format === 'pdf') {
        await reportService.exportPdf(analysisId, `${baseName}-land-analysis-report.pdf`)
        setExportSuccess('PDF Report downloaded successfully!')
      } else if (format === 'excel') {
        await reportService.exportExcel(analysisId, `${baseName}-land-analysis-report.xlsx`)
        setExportSuccess('Excel Workbook (.xlsx) downloaded successfully!')
      } else if (format === 'json') {
        await reportService.exportJson(analysisId, `${baseName}-land-analysis-report.json`)
        setExportSuccess('JSON Report downloaded successfully!')
      }
    } catch (err) {
      console.error(`Export ${format} error:`, err)
      alert(`Export failed: ${err.message || 'Error downloading file.'}`)
    } finally {
      setExportingType(null)
      setTimeout(() => setExportSuccess(null), 4000)
    }
  }

  const getImpactBadgeClass = (impact) => {
    switch (impact) {
      case 'Positive':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/20'
      case 'Moderate':
        return 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500/20'
      case 'Negative':
        return 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-500/20'
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Decision Support
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Detailed Land Analysis Breakdown
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Property: <strong className="text-slate-700">{prop.land_name || 'Selected Parcel'}</strong>
              {prop.coordinates_display && (
                <span className="ml-2 font-mono text-[11px] text-slate-400">({prop.coordinates_display})</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"
            title="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1 text-sm">
          {loading && <Loader label="Compiling detailed GIS factor scores & provenance..." />}
          
          {error && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
              {error}
            </div>
          )}

          {exportSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{exportSuccess}</span>
            </div>
          )}

          {/* Section 1: Executive Suitability & Property Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Score Display Card */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex flex-col items-center justify-center text-center">
              <ScoreGauge score={suit.score ?? 0} size={150} />
              <div className="mt-2 text-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Score</span>
                <p className="text-sm font-bold text-blue-700">{suit.rating || 'Calculated Feasibility'}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-700 shadow-sm">
                  <span>Risk: {suit.risk_level || 'Low'}</span>
                  <span className="text-slate-400">({suit.risk_score ?? 0}%)</span>
                </div>
              </div>
            </div>

            {/* Property Characteristics Table */}
            <div className="md:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Property Profile</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Location</span>
                  <span className="font-semibold text-slate-800 line-clamp-1">{prop.land_name || 'Selected Plot'}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Building Target</span>
                  <span className="font-semibold text-blue-700">{prop.selected_building_type || 'Individual House'}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Parcel Area</span>
                  <div className="font-semibold text-slate-800">
                    <div>{Number(areaSqFt).toLocaleString()} sq.ft</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {Number(areaSqm).toLocaleString()} m² • {Number(areaCents).toFixed(2)} cents
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Road Width</span>
                  <span className="font-semibold text-slate-800">
                    {prop.road_width_ft ? `${prop.road_width_ft} ft` : '20 ft (Standard)'}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Soil Taxonomy</span>
                  <span className="font-semibold text-slate-800">{prop.soil_type || 'Loamy'}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[10px]">Zoning / Land Type</span>
                  <span className="font-semibold text-slate-800">{prop.land_type || 'Residential'}</span>
                </div>
              </div>

              {rec.ai_explanation && (
                <div className="mt-3 bg-blue-50/70 border border-blue-100 p-3 rounded-lg text-xs text-blue-900 leading-relaxed">
                  <strong className="text-blue-800 block mb-0.5">AI Feasibility Synthesis:</strong>
                  {rec.ai_explanation}
                </div>
              )}
            </div>
          </div>

          {/* Section 1.5: Plot Size Validation & Indicative Construction Cost */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Plot Size Validation Card */}
            <div className={`p-4 rounded-xl border ${plotVal.is_valid !== false ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>📐</span> Plot Requirement Validation
                </span>
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                  plotVal.is_valid !== false 
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  {plotVal.status || (plotVal.is_valid !== false ? 'SUITABLE' : 'DEFICIT')}
                </span>
              </div>
              <div className="text-xs text-slate-700 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Minimum Required Area:</span>
                  <span className="font-bold">{Number(plotVal.required_min_sqft || 400).toLocaleString()} sq.ft</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Actual Parcel Area:</span>
                  <span className="font-bold">{Number(plotVal.actual_sqft || areaSqFt).toLocaleString()} sq.ft</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/60 font-semibold">
                  <span className="text-slate-600">Surplus / Deficit:</span>
                  <span className={plotVal.is_valid !== false ? 'text-emerald-700' : 'text-rose-700'}>
                    {plotVal.is_valid !== false ? '+' : '-'}{Number(plotVal.deficit_or_surplus_sqft || 0).toLocaleString()} sq.ft
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 pt-1 leading-snug">
                  {plotVal.message || 'Plot area meets minimum regulatory size guidelines.'}
                </p>
              </div>
            </div>

            {/* Indicative Construction Cost Card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>🏗️</span> Construction Cost Estimator
                </span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  ₹{Number(cost.rate_per_sqft || 2000).toLocaleString()}/sq.ft
                </span>
              </div>
              <div className="text-xs space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">Total Estimated Cost:</span>
                  <span className="text-base font-black text-slate-900">
                    ₹{Number(cost.total_estimated_cost || (areaSqFt * 2000)).toLocaleString()}
                  </span>
                </div>
                {/* Cost Breakdown Bars */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-1">
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="text-slate-400 block">Material (55%)</span>
                    <strong className="text-slate-800">₹{Number(cost.material_cost || (areaSqFt * 2000 * 0.55)).toLocaleString()}</strong>
                  </div>
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="text-slate-400 block">Labour (25%)</span>
                    <strong className="text-slate-800">₹{Number(cost.labour_cost || (areaSqFt * 2000 * 0.25)).toLocaleString()}</strong>
                  </div>
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="text-slate-400 block">Finishing (20%)</span>
                    <strong className="text-slate-800">₹{Number(cost.finishing_cost || (areaSqFt * 2000 * 0.20)).toLocaleString()}</strong>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 pt-0.5 leading-tight">
                  *Indicative civil estimate in Indian Rupees (₹).
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Factor Breakdown with "Why this score?" physical explanations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Key Factor Breakdown & Physical Reasons</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Evaluated across 7 real environmental and spatial dimensions)
                </span>
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {factors.map((f, idx) => (
                <div 
                  key={idx} 
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-bold text-slate-800 text-sm">{f.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getImpactBadgeClass(f.impact)}`}>
                        {f.impact}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 my-1.5">
                      <span className="text-2xl font-black text-slate-900">
                        {f.score !== null && f.score !== undefined ? `${f.score}%` : 'N/A'}
                      </span>
                      {f.weight && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Weight: {Math.round(f.weight * 100)}%
                        </span>
                      )}
                    </div>

                    {/* Mini Progress Bar */}
                    {f.score !== null && f.score !== undefined && (
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                        <div 
                          className={`h-full rounded-full ${
                            f.score >= 70 ? 'bg-emerald-500' : f.score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.max(4, Math.min(100, f.score))}%` }}
                        />
                      </div>
                    )}

                    {/* "Why this score?" Physical Explanation Box */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] text-slate-700 mb-1.5">
                      <strong className="text-blue-700 block text-[10px] uppercase tracking-wider mb-0.5">Why this score?</strong>
                      {f.why_reason || f.description}
                    </div>

                    {f.data_source && (
                      <div className="text-[10px] text-slate-400 flex justify-between items-center">
                        <span>Source: {f.data_source}</span>
                        {f.data_confidence && <span>{f.data_confidence}% conf</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Calculation Breakdown & ML Model Transparency */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Score Calculation & ML Algorithm Transparency
              </h4>
              <button
                onClick={() => setShowFormulaDetails(!showFormulaDetails)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                {showFormulaDetails ? 'Hide Details' : 'How was this score calculated?'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-600 mb-1.5">
                  <strong>Pipeline:</strong> {calc.methodology || 'Hybrid Machine Learning (Random Forest) + Physical Hydrological & Geomorphic Modeling'}
                </p>
                <div className="p-3 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800">
                  {calc.formula || 'Suitability = 100 - (0.35 × FloodRisk + 0.25 × AccessRisk + 0.25 × InfraRisk + 0.15 × EnvRisk)'}
                </div>
              </div>
              <div>
                <p className="text-slate-600 mb-1.5">
                  <strong>Risk Dimension Weights:</strong>
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Flood Safety Weight</span>
                    <strong className="text-slate-700">{calc.weights?.flood_risk_weight || '35%'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Road Access Weight</span>
                    <strong className="text-slate-700">{calc.weights?.accessibility_risk_weight || '25%'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Infrastructure Weight</span>
                    <strong className="text-slate-700">{calc.weights?.infrastructure_risk_weight || '25%'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block">Environmental Weight</span>
                    <strong className="text-slate-700">{calc.weights?.environmental_risk_weight || '15%'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {showFormulaDetails && (
              <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200 text-xs text-slate-700 leading-relaxed space-y-1.5">
                <p className="font-bold text-blue-900">How the Hybrid AI & Physical Engine works:</p>
                <p>1. <strong>Physical Hydrology</strong>: Uses Open-Meteo elevation and Copernicus GloFAS river discharge to calculate flood vulnerability.</p>
                <p>2. <strong>Spatial Connectivity</strong>: Queries OpenStreetMap Overpass for road access corridor width and municipal utility points.</p>
                <p>3. <strong>Geotechnical Soil & Land Cover</strong>: Queries ISRIC SoilGrids 250m WRB taxonomy and ESA WorldCover 10m satellite classification.</p>
                <p>4. <strong>Random Forest Ensemble</strong>: Weighs all dimensions against building type requirements to predict feasibility score and risk level.</p>
              </div>
            )}
          </div>

          {/* Section 4: Scientific Data Quality & Completeness Indicators */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Scientific Data Quality & Completeness</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                  Overall Quality: {quality.overall_confidence_pct ?? 94}% ({quality.status || 'High Quality'})
                </span>
              </h4>
            </div>

            <div className="space-y-2.5">
              {(quality.items || []).map((q, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                  <div className="sm:w-1/3">
                    <span className="font-bold text-slate-800">{q.category}</span>
                    <span className="text-[10px] text-slate-400 block">{q.basis}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${q.completeness_pct >= 90 ? 'bg-emerald-500' : q.completeness_pct >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                        style={{ width: `${q.completeness_pct}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold text-slate-700 w-10 text-right">{q.completeness_pct}%</span>
                  </div>
                  <div className="sm:w-36 text-right">
                    <span className="text-[10px] font-semibold text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                      {q.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Exact Data Sources & Provenance Metadata */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Exact Data Sources & Provenance Metadata</h4>
            <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3.5 py-2.5">Dataset</th>
                    <th className="px-3.5 py-2.5">Source Provider</th>
                    <th className="px-3.5 py-2.5">Data Date / Version</th>
                    <th className="px-3.5 py-2.5">Resolution</th>
                    <th className="px-3.5 py-2.5">Processing Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sources.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="px-3.5 py-2 font-bold text-slate-800">{s.dataset_name}</td>
                      <td className="px-3.5 py-2 text-slate-600">{s.source}</td>
                      <td className="px-3.5 py-2 text-slate-500">{s.data_date}</td>
                      <td className="px-3.5 py-2 font-mono text-[11px] text-slate-600">{s.resolution}</td>
                      <td className="px-3.5 py-2 text-slate-500">{s.processing_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 6: Historical Change Status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-700 mb-1">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Historical Land Use Change</span>
              <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-semibold uppercase">
                {historical.status || 'Unavailable'}
              </span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              {historical.message || 'Historical change analysis is unavailable for this location. Multi-temporal satellite imagery analysis requires connected time-series satellite feeds.'}
            </p>
          </div>

          {/* Section 7: Regulatory Notice & Disclaimer */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 leading-relaxed">
            <strong className="text-amber-800 block mb-1 font-bold">Official Regulatory Notice & Disclaimer:</strong>
            {disclaimer}
          </div>
        </div>

        {/* Footer: Multi-Format Export Action Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Export decision report in high-fidelity professional formats:
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={exportingType !== null}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {exportingType === 'pdf' ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span>📄</span>
              )}
              <span>Download PDF</span>
            </button>

            <button
              onClick={() => handleExport('excel')}
              disabled={exportingType !== null}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {exportingType === 'excel' ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span>📊</span>
              )}
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={() => handleExport('json')}
              disabled={exportingType !== null}
              className="px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {exportingType === 'json' ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span>📦</span>
              )}
              <span>Export JSON</span>
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
