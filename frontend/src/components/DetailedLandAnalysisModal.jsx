import React, { useState, useEffect, useRef, useCallback } from 'react'
import analysisService from '../services/analysisService'
import reportService from '../services/reportService'
import landService from '../services/landService'
import gisService from '../services/gisService'
import ScoreGauge from './ScoreGauge'
import Loader from './Loader'
import BuildingPlanningRulesCard from './BuildingPlanningRulesCard'

/**
 * DetailedModalErrorBoundary
 * Prevents any unexpected rendering errors inside the modal
 * from crashing the React root application tree.
 */
class DetailedModalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('DetailedLandAnalysisModal caught rendering error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-xl mx-auto mb-3">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Error Displaying Breakdown
            </h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              An unexpected display issue occurred while rendering the detailed breakdown.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * DetailedLandAnalysisModalContent
 * --------------------------------
 * Comprehensive, interactive breakdown modal for land analysis.
 * Displays factor scores, 4-unit area conversions (sq.ft, sq.m, cents, acres),
 * area source provenance, data quality, calculation methodology, and multi-format exports.
 */
function DetailedLandAnalysisModalContent({
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
  const [facilityRadius, setFacilityRadius] = useState(5.0)
  const [customFacilities, setCustomFacilities] = useState(null)
  const [loadingFacilities, setLoadingFacilities] = useState(false)
  const reqIdRef = useRef(0)

  const fetchDetailedData = useCallback((idToFetch) => {
    const id = idToFetch || analysisId
    if (!id) return
    setLoading(true)
    setError(null)
    analysisService
      .getDetailedAnalysis(id)
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch detailed analysis:', err)
        const errMsg = err.response?.data?.detail || err.message || 'Could not load detailed analysis breakdown.'
        setError(errMsg)
        setLoading(false)
      })
  }, [analysisId])

  // Fetch detailed data whenever modal opens
  useEffect(() => {
    if (!isOpen) return

    setCustomFacilities(null)
    setFacilityRadius(5.0)
    setLoadingFacilities(false)

    if (initialData) {
      setData(initialData)
    } else {
      setData(null)
    }

    if (analysisId) {
      fetchDetailedData(analysisId)
    }
  }, [isOpen, analysisId, initialData, fetchDetailedData])

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
  const factors = Array.isArray(data?.factors) ? data.factors : []
  const calc = data?.score_calculation || {}
  const quality = data?.data_quality || {}
  const historical = data?.historical_change || {}
  const rec = data?.recommendation || {}
  const areaConv = data?.area_conversions || {}
  const plotVal = data?.plot_validation || {}
  const facilities = customFacilities || data?.nearby_facilities || {}
  const disclaimer = data?.disclaimer || 'This analysis is a GIS-based decision-support assessment.'

  const handleRadiusChange = async (radius, force = false) => {
    const currentFacilities = customFacilities || data?.nearby_facilities
    const currentCount = currentFacilities?.total_facilities_found ?? currentFacilities?.total_found ?? (Array.isArray(currentFacilities?.all_facilities) ? currentFacilities.all_facilities.length : 0)

    if (!force && radius === facilityRadius && currentFacilities && currentCount > 0 && currentFacilities.status !== 'unavailable') {
      return
    }

    setFacilityRadius(radius)
    setLoadingFacilities(true)
    const thisReqId = ++reqIdRef.current

    try {
      let res = null
      const lat = prop.latitude ?? data?.latitude ?? data?.property_info?.latitude
      const lng = prop.longitude ?? data?.longitude ?? data?.property_info?.longitude
      const landId = prop.land_id ?? prop.id ?? data?.land_id ?? data?.property_info?.land_id

      if (landId) {
        res = await landService.getNearbyFacilities(landId, radius)
      } else if (lat != null && lng != null) {
        res = await gisService.fetchNearbyFacilities(lat, lng, radius)
      }

      if (thisReqId === reqIdRef.current && res) {
        setCustomFacilities(res)
      }
    } catch (err) {
      console.warn('Failed to update nearby facility radius:', err)
      if (thisReqId === reqIdRef.current) {
        setCustomFacilities({ status: 'unavailable', categories: {}, total_facilities_found: 0 })
      }
    } finally {
      if (thisReqId === reqIdRef.current) {
        setLoadingFacilities(false)
      }
    }
  }

  // Auto-fetch facilities if analysis loads without nearby facilities data
  useEffect(() => {
    if (!isOpen || !data) return
    const fac = customFacilities || data?.nearby_facilities
    const count = fac?.total_facilities_found ?? fac?.total_found ?? (Array.isArray(fac?.all_facilities) ? fac.all_facilities.length : 0)
    if (!customFacilities && (!fac || (count === 0 && fac?.status !== 'success'))) {
      handleRadiusChange(facilityRadius || 5.0, true)
    }
  }, [isOpen, data])

  const rawSqFt = areaConv.sqft ?? prop.area_sqft ?? 0
  const areaSqFt = isNaN(Number(rawSqFt)) ? 0 : Number(rawSqFt)
  const rawSqm = areaConv.sqm ?? (areaSqFt ? (areaSqFt / 10.7639).toFixed(1) : 0)
  const areaSqm = isNaN(Number(rawSqm)) ? 0 : Number(rawSqm)
  const rawCents = areaConv.cents ?? (areaSqFt ? (areaSqFt / 435.6).toFixed(4) : 0)
  const areaCents = isNaN(Number(rawCents)) ? 0 : Number(rawCents)
  const rawAcres = areaConv.acres ?? (areaSqFt ? (areaSqFt / 43560).toFixed(4) : 0)
  const areaAcres = isNaN(Number(rawAcres)) ? 0 : Number(rawAcres)

  const areaSource = prop.area_source || areaConv.source || 'polygon'
  const isDirectInput = areaSource === 'direct_input'
  const sourceLabel = isDirectInput ? 'User-entered Land Area' : 'Area calculated from selected land boundary'

  const isValidPlot = plotVal.is_valid !== false && plotVal.is_sufficient !== false
  const minRequiredSqFt = Number(plotVal.min_required_sqft || plotVal.required_min_sqft || 400)
  const actualPlotSqFt = Number(plotVal.actual_sqft || areaSqFt || 0)
  const diffPlotSqFt = Number(plotVal.deficit_or_surplus_sqft || Math.abs(actualPlotSqFt - minRequiredSqFt) || 0)

  const handleExport = async (format) => {
    if (!analysisId) {
      alert('Analysis ID is not available for export yet.')
      return
    }
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
            type="button"
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
          {loading && !data && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <h4 className="text-base font-bold text-slate-800">Compiling Detailed Land Analysis Breakdown...</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Synthesizing GIS environmental factor scores, plot validation, 4-unit area calculations, and nearby essential facilities.
              </p>
            </div>
          )}

          {error && !data && (
            <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-xl mb-3">
                ⚠️
              </div>
              <h4 className="text-base font-bold text-slate-800">Unable to Load Detailed Breakdown</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-md mb-5 leading-relaxed">
                {error}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fetchDetailedData(analysisId)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <span>🔄 Retry Loading</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!data && !loading && !error && (
            <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center text-xl mb-3">
                📊
              </div>
              <h4 className="text-base font-bold text-slate-800">No Breakdown Data Available</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mb-5 leading-relaxed">
                No detailed analysis record was found for this property.
              </p>
              <button
                type="button"
                onClick={() => fetchDetailedData(analysisId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Fetch Breakdown
              </button>
            </div>
          )}

          {data && (
            <>
              {loading && <Loader label="Refreshing detailed factor scores & provenance..." />}

              {error && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => fetchDetailedData(analysisId)}
                    className="ml-3 font-bold underline hover:text-amber-900"
                  >
                    Retry
                  </button>
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
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Property Profile</h4>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                      {sourceLabel}
                    </span>
                  </div>

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
                      <span className="text-slate-400 block text-[10px]">Parcel Area (Normalized)</span>
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
                        {prop.road_width_ft ? `${prop.road_width_ft} ft` : 'Width data unavailable'}
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

              {/* Section 1.2: 4-Unit Area Conversion Table & Source Provenance */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <span>🔄</span> Land Area Measurements (4 Standard Units)
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Source: <strong>{sourceLabel}</strong>
                  </span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Square Feet (sq.ft)</span>
                    <strong className="text-sm font-black text-blue-700">{Number(areaSqFt).toLocaleString()} sq.ft</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Square Meters (m²)</span>
                    <strong className="text-sm font-black text-slate-800">{Number(areaSqm).toLocaleString()} m²</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Cents</span>
                    <strong className="text-sm font-black text-slate-800">{Number(areaCents).toFixed(4)} cents</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Acres</span>
                    <strong className="text-sm font-black text-slate-800">{Number(areaAcres).toFixed(4)} acres</strong>
                  </div>
                </div>

                {isDirectInput && (
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    * Note: Evaluated via direct area entry ({prop.input_area || areaSqFt} {prop.input_unit || 'sq.ft'}). Environmental and hydrological factors were analyzed at the representative location point on the map.
                  </p>
                )}
              </div>

              {/* Section 1.5: Plot Size Validation */}
              <div className="w-full">
                <div className={`p-4 rounded-xl border ${isValidPlot ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span>📐</span> Plot Requirement Validation
                    </span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                      isValidPlot
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      {plotVal.status || (isValidPlot ? 'SUITABLE' : 'DEFICIT')}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 mt-2">
                    <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                      <span className="text-slate-500 block text-[11px]">Minimum Required Area:</span>
                      <span className="font-bold text-slate-800 text-sm">{minRequiredSqFt.toLocaleString()} sq.ft</span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                      <span className="text-slate-500 block text-[11px]">Actual Parcel Area:</span>
                      <span className="font-bold text-slate-800 text-sm">{actualPlotSqFt.toLocaleString()} sq.ft</span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                      <span className="text-slate-500 block text-[11px]">Surplus / Deficit:</span>
                      <span className={`font-bold text-sm ${isValidPlot ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {isValidPlot ? '+' : '-'}{diffPlotSqFt.toLocaleString()} sq.ft
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 pt-2 leading-snug">
                    {plotVal.message || 'Plot area meets minimum regulatory size guidelines.'}
                  </p>
                </div>
              </div>

              {/* Section 1.8: TNCDBR 2019 Building Planning Rules & FSI Engine */}
              {data?.building_planning_rules && (
                <div className="w-full">
                  <BuildingPlanningRulesCard rules={data.building_planning_rules} />
                </div>
              )}

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
                  {factors.map((f, idx) => {
                    const scoreVal = typeof f.score === 'number' ? f.score : (!isNaN(parseFloat(f.score)) ? parseFloat(f.score) : null)
                    return (
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
                              {scoreVal !== null ? `${scoreVal}%` : 'N/A'}
                            </span>
                            {f.weight && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                Weight: {Math.round(f.weight * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Mini Progress Bar */}
                          {scoreVal !== null && (
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                              <div 
                                className={`h-full rounded-full ${
                                  scoreVal >= 70 ? 'bg-emerald-500' : scoreVal >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.max(4, Math.min(100, scoreVal))}%` }}
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
                    )
                  })}
                </div>
              </div>

              {/* Section 3: Calculation Breakdown & ML Model Transparency */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Score Calculation & ML Algorithm Transparency
                  </h4>
                  <button
                    type="button"
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
                    <p>1. <strong>Physical Hydrology</strong>: Models terrain elevation, runoff accumulation, and river discharge to calculate flood vulnerability.</p>
                    <p>2. <strong>Spatial Connectivity</strong>: Evaluates road access corridor width and municipal utility infrastructure proximity.</p>
                    <p>3. <strong>Geotechnical Soil & Land Cover</strong>: Evaluates soil taxonomy composition, load-bearing suitability, and satellite land cover classification.</p>
                    <p>4. <strong>Machine Learning Ensemble</strong>: Weighs all dimensions against building type requirements to predict feasibility score and risk level.</p>
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
                  {(Array.isArray(quality.items) ? quality.items : []).map((q, idx) => {
                    const compPct = typeof q.completeness_pct === 'number' ? q.completeness_pct : (!isNaN(parseFloat(q.completeness_pct)) ? parseFloat(q.completeness_pct) : 0)
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                        <div className="sm:w-1/3">
                          <span className="font-bold text-slate-800">{q.category}</span>
                          <span className="text-[10px] text-slate-400 block">{q.basis}</span>
                        </div>
                        <div className="flex-1 flex items-center gap-3">
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${compPct >= 90 ? 'bg-emerald-500' : compPct >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, compPct))}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-700 w-10 text-right">{compPct}%</span>
                        </div>
                        <div className="sm:w-36 text-right">
                          <span className="text-[10px] font-semibold text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                            {q.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Section 5: Nearby Essential Facilities & Geodesic Proximity */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>📍</span> Nearby Essential Facilities & Geodesic Proximity
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Essential infrastructure • Geodesic straight-line distance in kilometres (km) from parcel centroid. Actual travel distance via roads may vary.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Interactive Radius Toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-500 px-1.5">Radius:</span>
                      {[5.0, 10.0].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleRadiusChange(r)}
                          disabled={loadingFacilities}
                          className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${
                            facilityRadius === r
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                          }`}
                        >
                          {r} km
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                      {facilities.total_facilities_found ?? facilities.total_found ?? (Array.isArray(facilities.all_facilities) ? facilities.all_facilities.length : 0)} found
                    </span>
                  </div>
                </div>

                {facilities?.status === 'unavailable' && !loadingFacilities && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-3 flex items-center justify-between text-xs text-amber-800">
                    <span>⚠️ Proximity service temporarily busy. You can click Retry or change search radius.</span>
                    <button
                      type="button"
                      onClick={() => handleRadiusChange(facilityRadius, true)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-[11px]"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {loadingFacilities || (!facilities && loading) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl my-2">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs font-semibold text-slate-700">Analyzing nearby facilities ({facilityRadius} km)...</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Computing geodesic straight-line proximity</p>
                  </div>
                ) : (() => {
                  const isUnavailable = facilities?.status === 'unavailable'
                  const isPending = !facilities || loadingFacilities
                  const catObj = (facilities && typeof facilities === 'object') ? (facilities.categories || facilities) : {}
                  const toArray = (v) => (Array.isArray(v) ? v : [])
                  const facilityCategories = [
                    { label: 'Bus Stands & Transit', icon: '🚌', items: toArray(catObj.bus_stands || catObj.bus_stand) },
                    { label: 'Railway Stations', icon: '🚆', items: toArray(catObj.railway_stations || catObj.railway_station) },
                    { label: 'Airports', icon: '✈️', items: toArray(catObj.airports || catObj.airport) },
                    { label: 'Hospitals & Medical', icon: '🏥', items: toArray(catObj.hospitals || catObj.hospital) },
                    { label: 'Schools & Colleges', icon: '🏫', items: toArray(catObj.schools || catObj.school_college) },
                    { label: 'Commercial & Shopping', icon: '🛍️', items: toArray(catObj.commercial || catObj.shopping_commercial) },
                    { label: 'Main Roads & Access', icon: '🛣️', items: toArray(catObj.roads || catObj.main_roads) },
                    { label: 'Water Bodies & Hydrology', icon: '🌊', items: toArray(catObj.water_bodies) },
                  ]

                  return (
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {facilityCategories.map((cat, idx) => {
                          const count = cat.items.length
                          return (
                            <div key={idx} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <span>{cat.icon}</span> {cat.label}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${count > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {count}
                                  </span>
                                </div>

                                {count === 0 ? (
                                  isUnavailable ? (
                                    <p className="text-[11px] text-amber-600/80 italic mt-2">Data temporarily busy</p>
                                  ) : isPending ? (
                                    <p className="text-[11px] text-slate-400 italic mt-2">Checking proximity records...</p>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic mt-2">No records within search radius</p>
                                  )
                                ) : (
                                  <div className="space-y-1.5 mt-2">
                                    {cat.items.slice(0, 2).map((item, iIdx) => {
                                      const dist = typeof item.distance_km === 'number'
                                        ? item.distance_km
                                        : (typeof item.distanceKm === 'number'
                                          ? item.distanceKm
                                          : (!isNaN(parseFloat(item.distance_km)) ? parseFloat(item.distance_km) : 0))
                                      return (
                                        <div key={iIdx} className="flex items-start justify-between text-[11px] gap-1">
                                          <span className="text-slate-700 font-medium truncate" title={item.name}>
                                            {item.name || 'Unnamed facility'}
                                          </span>
                                          <span className="text-blue-700 font-bold shrink-0 font-mono text-[10px]">
                                            {dist.toFixed(2)} km
                                          </span>
                                        </div>
                                      )
                                    })}
                                    {count > 2 && (
                                      <span className="text-[10px] text-slate-400 block">+{count - 2} more within radius</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
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

              {/* Section 8: Regulatory Notice & Disclaimer */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 leading-relaxed">
                <strong className="text-amber-800 block mb-1 font-bold">Official Regulatory Notice & Disclaimer:</strong>
                {disclaimer}
              </div>
            </>
          )}
        </div>

        {/* Footer: Multi-Format Export Action Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Export decision report in high-fidelity professional formats:
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exportingType !== null || !data}
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
              type="button"
              onClick={() => handleExport('excel')}
              disabled={exportingType !== null || !data}
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
              type="button"
              onClick={() => handleExport('json')}
              disabled={exportingType !== null || !data}
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
              type="button"
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

export default function DetailedLandAnalysisModal(props) {
  if (!props.isOpen) return null
  return (
    <DetailedModalErrorBoundary onClose={props.onClose}>
      <DetailedLandAnalysisModalContent {...props} />
    </DetailedModalErrorBoundary>
  )
}
