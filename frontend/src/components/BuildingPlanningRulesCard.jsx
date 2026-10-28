import React, { useState } from 'react'

/**
 * BuildingPlanningRulesCard
 * -------------------------
 * Renders statutory building planning parameters under the
 * Tamil Nadu Combined Development and Building Rules, 2019 (TNCDBR-2019).
 *
 * Displays:
 * - Base FSI and statutory theoretical max floor area
 * - Certified practical achievable floor area ONLY when verified geometry exists
 * - Explicit 'Dimension Survey Required' notice when plot frontage/depth are unmeasured
 * - Clearly segregated hypothetical 1:1.5 scenario with prominent disclosure
 * - Mandatory Front, Rear, and Side setbacks in metres and feet
 * - Road width statutory adequacy per building category
 * - Permissible building height and typical floor count
 * - Calculation assumptions and missing parameters
 * - Statutory planning disclaimer
 */
export default function BuildingPlanningRulesCard({ rules, className = '' }) {
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [showHypothetical, setShowHypothetical] = useState(false)

  if (!rules) return null

  const isInsufficient = rules.status === 'insufficient_data'
  const source = rules.statutory_source || {}
  const feasibility = rules.planning_feasibility || {}
  const road = rules.road_width || {}
  const fsi = rules.floor_space_index || {}
  const setbacks = rules.setbacks || {}
  const heightData = rules.height_and_floors || {}
  const coverage = rules.plot_coverage || {}
  const geometry = rules.geometry || {}
  const indicativeScenario = rules.indicative_scenario
  const assumptions = rules.calculation_assumptions || []
  const missingContext = rules.missing_context || []

  const disclaimerText =
    rules.disclaimer ||
    'These results are preliminary planning guidance based on available inputs and verified rules. They are not official building approval or a substitute for professional architectural or engineering assessment.'

  // Insufficient Data State
  if (isInsufficient) {
    return (
      <div className={`bg-amber-50/80 border border-amber-200 rounded-2xl p-6 shadow-sm ${className}`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-xl shrink-0">
            ⚠️
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-amber-900">
                Building Planning Rules & FSI Assessment
              </h3>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                Incomplete Data
              </span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              {rules.message || 'Sufficient inputs are not available to evaluate statutory planning rules.'}
            </p>
            {Array.isArray(rules.missing_inputs) && rules.missing_inputs.length > 0 && (
              <div className="bg-white/80 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900">
                <span className="font-bold block mb-1">Required Information:</span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  {rules.missing_inputs.map((inp, idx) => (
                    <li key={idx}>{inp}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-amber-700/90 italic pt-1 border-t border-amber-200/60">
              * {disclaimerText}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const isRoadDeficient = road.adequacy === 'deficient'
  const isRoadSubstandard = road.adequacy === 'substandard'
  const isGeometryVerified = geometry.is_verified === true

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 ${className}`}>
      
      {/* Header: Title, Authority Citation & Feasibility Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              TNCDBR 2019 Regulatory Compliance
            </span>
          </div>
          <h3 className="text-lg font-black text-slate-900 mt-1">
            Building Planning Rules & FSI Engine
          </h3>
          <p className="text-xs text-slate-500">
            {rules.rule_title} ({rules.rule_reference}) · Occupancy: <strong>{rules.building_type}</strong>
          </p>
        </div>

        {/* Feasibility Badge */}
        <div className="flex items-center">
          <div
            className={`px-3.5 py-2 rounded-xl border text-center ${
              isRoadDeficient
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : isRoadSubstandard
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span className="text-[10px] uppercase font-bold tracking-wider block">
              Planning Feasibility
            </span>
            <span className="text-xs font-black">
              {feasibility.rating || feasibility.status || 'Statutorily Feasible'}
            </span>
          </div>
        </div>
      </div>

      {/* Road Width Adequacy Notice */}
      <div
        className={`p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${
          isRoadDeficient
            ? 'bg-rose-50/70 border-rose-200 text-rose-900'
            : isRoadSubstandard
            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <span className="text-lg shrink-0">
          {isRoadDeficient ? '🛑' : isRoadSubstandard ? '⚠️' : '🛣️'}
        </span>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">
              Abutting Road: {road.feet} ft ({road.meters} m)
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.2 rounded-full border uppercase ${
                isRoadDeficient
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : isRoadSubstandard
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {road.adequacy || 'adequate'}
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            {road.note}
          </p>
        </div>
      </div>

      {/* Key Planning Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        
        {/* Metric 1: Permissible Base FSI */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Permissible Base FSI
            </span>
            <span className="text-2xl font-black text-blue-700 block mt-0.5">
              {fsi.base_fsi ? fsi.base_fsi.toFixed(2) : '2.00'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1">
            Standard TNCDBR Ratio
          </span>
        </div>

        {/* Metric 2: Theoretical Max Gross Floor Area */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Theoretical Max Floor Area
            </span>
            <span className="text-lg font-black text-slate-900 block mt-0.5">
              {fsi.theoretical_max_floor_area_sqft ? Number(fsi.theoretical_max_floor_area_sqft).toLocaleString() : 'N/A'}{' '}
              <span className="text-xs font-normal text-slate-500">sq.ft</span>
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1">
            {fsi.theoretical_max_floor_area_sqm ? `${Number(fsi.theoretical_max_floor_area_sqm).toLocaleString()} m²` : ''} (Area × FSI)
          </span>
        </div>

        {/* Metric 3: Practical Achievable Built-up Area */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Achievable Built-up Area
            </span>
            {isGeometryVerified && fsi.practical_achievable_floor_area_sqft ? (
              <span className="text-lg font-black text-emerald-700 block mt-0.5">
                {Number(fsi.practical_achievable_floor_area_sqft).toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">sq.ft</span>
              </span>
            ) : (
              <div className="mt-1">
                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md inline-block">
                  Survey Required
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Frontage unmeasured</span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1">
            {isGeometryVerified ? 'Constrained by setbacks' : 'Requires site dimensions'}
          </span>
        </div>

        {/* Metric 4: Max Permissible Height */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Permissible Height
            </span>
            <span className="text-lg font-black text-slate-900 block mt-0.5">
              {heightData.max_permissible_height_meters ? `${heightData.max_permissible_height_meters} m` : '12.0 m'}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({heightData.max_permissible_height_feet ? `${heightData.max_permissible_height_feet} ft` : '39.4 ft'})
              </span>
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1 line-clamp-1" title={heightData.typical_permissible_floors}>
            {heightData.typical_permissible_floors || 'Up to G+2 Floors'}
          </span>
        </div>
      </div>

      {/* Mandatory Setbacks Card */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📐</span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Mandatory Setback Clearances (TNCDBR Rule 35)
            </h4>
          </div>
          <span className="text-[10px] text-blue-700 font-semibold bg-white border border-blue-200 px-2 py-0.5 rounded-full">
            Required Open Space
          </span>
        </div>

        {/* 4 Boundary Setbacks Visual Table */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          {/* Front Setback */}
          <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Front (Road-side)</span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Exact</span>
            </div>
            <div className="text-base font-black text-blue-800 mt-0.5">
              {setbacks.front?.meters} m <span className="text-xs font-semibold text-slate-500">({setbacks.front?.feet} ft)</span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1 leading-tight line-clamp-2" title={setbacks.front?.basis}>
              {setbacks.front?.basis}
            </span>
          </div>

          {/* Rear Setback */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Rear Boundary</span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Exact</span>
            </div>
            <div className="text-base font-black text-slate-800 mt-0.5">
              {setbacks.rear?.meters} m <span className="text-xs font-semibold text-slate-500">({setbacks.rear?.feet} ft)</span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1 leading-tight line-clamp-2" title={setbacks.rear?.basis}>
              {setbacks.rear?.basis}
            </span>
          </div>

          {/* Left Side Setback */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Side (Left)</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                isGeometryVerified ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
              }`}>
                {isGeometryVerified ? 'Verified' : 'Guidance'}
              </span>
            </div>
            <div className="text-base font-black text-slate-800 mt-0.5">
              {setbacks.side_left?.meters} m <span className="text-xs font-semibold text-slate-500">({setbacks.side_left?.feet} ft)</span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1 leading-tight line-clamp-2" title={setbacks.side_left?.basis}>
              {setbacks.side_left?.basis}
            </span>
          </div>

          {/* Right Side Setback */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Side (Right)</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                isGeometryVerified ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'
              }`}>
                {isGeometryVerified ? 'Verified' : 'Guidance'}
              </span>
            </div>
            <div className="text-base font-black text-slate-800 mt-0.5">
              {setbacks.side_right?.meters} m <span className="text-xs font-semibold text-slate-500">({setbacks.side_right?.feet} ft)</span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1 leading-tight line-clamp-2" title={setbacks.side_right?.basis}>
              {setbacks.side_right?.basis}
            </span>
          </div>
        </div>

        {/* Setback Ground Coverage Footprint Note */}
        <div className="text-[11px] text-slate-600 bg-white/70 p-3 rounded-lg border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {isGeometryVerified ? (
            <span>
              Buildable Ground Footprint:{' '}
              <strong className="text-slate-800">
                {coverage.achievable_ground_footprint_sqft ? Number(coverage.achievable_ground_footprint_sqft).toLocaleString() : 'N/A'} sq.ft
              </strong>{' '}
              (~{coverage.coverage_percentage || '0'}% coverage) · Source: <em>{geometry.source_label}</em>
            </span>
          ) : (
            <span className="text-amber-800">
              ⚠️ <strong>Ground coverage requires plot dimension survey:</strong> While Front Setback is exact, side setbacks and buildable ground footprint cannot be certified without verified frontage and depth measurements.
            </span>
          )}
          <span className="text-[10px] text-slate-500 italic shrink-0">
            * Setback-governed open spaces
          </span>
        </div>
      </div>

      {/* Hypothetical 1:1.5 Geometric Scenario (Only shown when dimensions are unverified) */}
      {!isGeometryVerified && indicativeScenario && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800">
                Hypothetical Planning Scenario (1:1.5 Aspect Ratio)
              </span>
              <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                Simulation Only
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowHypothetical(!showHypothetical)}
              className="text-xs font-bold text-blue-700 hover:text-blue-800"
            >
              {showHypothetical ? 'Hide Scenario' : 'View Simulation'}
            </button>
          </div>

          {showHypothetical && (
            <div className="pt-2 border-t border-slate-200/80 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">Indicative Ground Footprint</span>
                  <strong className="text-slate-800">{Number(indicativeScenario.estimated_ground_footprint_sqft).toLocaleString()} sq.ft</strong>
                  <span className="text-[10px] text-slate-400 block">~{indicativeScenario.estimated_coverage_percentage}% coverage</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">Indicative Built-up Floor Area</span>
                  <strong className="text-emerald-700">{Number(indicativeScenario.estimated_practical_floor_area_sqft).toLocaleString()} sq.ft</strong>
                  <span className="text-[10px] text-slate-400 block">Across permissible floors</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block text-[10px]">Simulated Plot Shape</span>
                  <span className="text-slate-800 font-medium text-[11px]">{indicativeScenario.assumed_aspect_ratio}</span>
                </div>
              </div>
              <p className="text-[10px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-snug">
                <strong>Important Notice:</strong> {indicativeScenario.disclaimer}
              </p>
            </div>
          )}
        </div>
      )}

      {/* High-Rise Eligibility Notice (Rule 39) if applicable */}
      {heightData.high_rise_eligible && heightData.high_rise_note && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
          <span className="text-base shrink-0">🏙️</span>
          <div>
            <strong className="font-bold text-indigo-950 block mb-0.5">High-Rise Building (Rule 39) Potential:</strong>
            <p className="text-[11px] leading-relaxed text-indigo-800">
              {heightData.high_rise_note}
            </p>
          </div>
        </div>
      )}

      {/* Feasibility Synthesis */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-1">
        <strong className="font-bold text-slate-900 block">
          Planning Assessment Summary:
        </strong>
        <p className="text-slate-600 leading-relaxed text-[11px]">
          {feasibility.summary}
        </p>
      </div>

      {/* Collapsible Assumptions & Unverified Local Nuances */}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowAssumptions(!showAssumptions)}
          className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1.5 transition-colors"
        >
          <span>{showAssumptions ? '▾ Hide' : '▸ View'} Calculation Assumptions & Missing Parameters</span>
        </button>

        {showAssumptions && (
          <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-3">
            <div>
              <span className="font-bold text-slate-800 text-[11px] block mb-1">Assumptions Made:</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                {assumptions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {missingContext.length > 0 && (
              <div>
                <span className="font-bold text-slate-800 text-[11px] block mb-1">Inputs Not Yet Provided:</span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                  {missingContext.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 space-y-0.5">
              <div><strong>Official Authority:</strong> {source.notification}</div>
              <div><strong>Applicable Rules:</strong> {source.applicable_parts}</div>
              <div><strong>Jurisdiction:</strong> {source.jurisdiction}</div>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Statutory Disclaimer */}
      <p className="text-[10px] text-slate-500/90 italic leading-snug pt-1 border-t border-slate-100">
        * <strong>Legal Disclaimer:</strong> {disclaimerText}
      </p>
    </div>
  )
}
