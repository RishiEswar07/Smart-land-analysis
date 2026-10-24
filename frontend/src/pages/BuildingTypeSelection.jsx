import { useState, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'

const STORAGE_KEY = 'smart_land_analysis_active_state'

export const BUILDING_TYPES = [
  {
    id: 'Individual House',
    displayName: 'House',
    icon: '🏡',
    minArea: '400 sq.ft min',
    minSqFt: 400,
    desc: 'Single-family standalone residence with standard setback codes.',
    zoning: 'Residential (Low-Density)',
  },
  {
    id: 'Apartment',
    displayName: 'Apartment',
    icon: '🏢',
    minArea: '2,000 sq.ft min',
    minSqFt: 2000,
    desc: 'Multi-family residential complex requiring vertical layout and parking bays.',
    zoning: 'Residential (Medium/High-Density)',
  },
  {
    id: 'Hospital',
    displayName: 'Hospital',
    icon: '🏥',
    minArea: '10,000 sq.ft min',
    minSqFt: 10000,
    desc: 'Healthcare facility with emergency bays, ambulance ingress, and patient wards.',
    zoning: 'Institutional / Commercial',
  },
  {
    id: 'School',
    displayName: 'School',
    icon: '🏫',
    minArea: '5,000 sq.ft min',
    minSqFt: 5000,
    desc: 'Educational campus with classrooms, safety setbacks, and student assembly grounds.',
    zoning: 'Institutional / Public',
  },
  {
    id: 'Commercial Building',
    displayName: 'Commercial Building',
    icon: '🏬',
    minArea: '1,500 sq.ft min',
    minSqFt: 1500,
    desc: 'Retail, business offices, or mixed commercial hub with high accessibility.',
    zoning: 'Commercial / Mixed-Use',
  },
]

export default function BuildingTypeSelection() {
  const navigate = useNavigate()

  // Load previously selected building type if present
  const [selectedType, setSelectedType] = useState(() => {
    try {
      const stored = localStorage.getItem('selected_building_type')
      if (stored) return stored
      const stateItem = sessionStorage.getItem(STORAGE_KEY)
      if (stateItem) {
        const parsed = JSON.parse(stateItem)
        if (parsed?.selectedBuildingType) return parsed.selectedBuildingType
      }
    } catch {
      // Fallback
    }
    return 'Individual House'
  })

  // Synchronize selection with storage
  useEffect(() => {
    try {
      localStorage.setItem('selected_building_type', selectedType)
      const existingStr = sessionStorage.getItem(STORAGE_KEY)
      const existing = existingStr ? JSON.parse(existingStr) : {}
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedBuildingType: selectedType,
          step: 'select',
        })
      )
    } catch (e) {
      console.warn('Storage sync error:', e)
    }
  }, [selectedType])

  const handleContinue = () => {
    try {
      localStorage.setItem('selected_building_type', selectedType)
      sessionStorage.setItem('selected_building_type', selectedType)
      const existingStr = sessionStorage.getItem(STORAGE_KEY)
      const existing = existingStr ? JSON.parse(existingStr) : {}
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...existing,
          selectedBuildingType: selectedType,
          step: 'select',
        })
      )
    } catch (e) {
      console.warn('Storage sync error on continue:', e)
    }
    navigate('/land-analysis')
  }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12">
      {/* Workflow Step Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <span className="text-[11px] uppercase tracking-widest font-bold text-blue-600">
            Step 1 of 4 · Analysis Workflow
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-800">
            Select Building Type
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Choose the category of building you plan to construct to evaluate minimum plot requirements and zoning suitability.
          </p>
        </div>

        <NavLink
          to="/dashboard"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
        >
          ← Back to Dashboard
        </NavLink>
      </div>

      {/* Building Type Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {BUILDING_TYPES.map((b) => {
          const isSelected = selectedType === b.id || selectedType === b.displayName
          return (
            <div
              key={b.id}
              onClick={() => setSelectedType(b.id)}
              className={`p-5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between relative ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/70 shadow-md ring-2 ring-blue-500/30'
                  : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/50 shadow-sm'
              }`}
            >
              {isSelected && (
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                  ✓
                </div>
              )}

              <div>
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-2xl mb-4">
                  {b.icon}
                </div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  {b.displayName}
                </h3>
                <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5 mb-2">
                  {b.zoning}
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {b.desc}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-md">
                  {b.minArea}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {isSelected ? 'Selected' : 'Click to select'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Action Footer */}
      <div className="card-base p-6 bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-500 block">Selected Project:</span>
          <strong className="text-base text-slate-900 font-bold">
            {BUILDING_TYPES.find((b) => b.id === selectedType || b.displayName === selectedType)?.displayName || selectedType}
          </strong>
        </div>

        <div className="flex items-center gap-3">
          <NavLink
            to="/dashboard"
            className="px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-semibold transition-colors"
          >
            Cancel
          </NavLink>
          <button
            type="button"
            onClick={handleContinue}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
          >
            <span>Continue to Land Selection</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
