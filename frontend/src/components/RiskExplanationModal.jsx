import React from 'react'

/**
 * RiskExplanationModal
 * -------------------
 * Provides detailed transparent engineering and geospatial explanation for:
 * - Flood Risk
 * - Road Accessibility Risk
 * - Infrastructure Risk
 * - Environmental Risk
 */
export default function RiskExplanationModal({ isOpen, onClose, factorKey, factorData, landData }) {
  if (!isOpen) return null

  const key = (factorKey || '').toLowerCase()
  const score = factorData?.score ?? 0
  const label = factorData?.label || factorKey || 'Risk Factor'
  const weight = factorData?.weight != null ? Math.round(factorData.weight * 100) : null
  const whyReason = factorData?.why_reason || ''

  const getRiskLevel = (s) => {
    if (s <= 30) return { label: 'Low Risk', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
    if (s <= 60) return { label: 'Moderate Risk', color: 'bg-amber-100 text-amber-800 border-amber-300' }
    return { label: 'High Risk', color: 'bg-rose-100 text-rose-800 border-rose-300' }
  }

  const riskLevel = getRiskLevel(score)

  const getFactorDetails = () => {
    if (key.includes('flood')) {
      return {
        title: 'Flood & Hydrology Risk Assessment',
        icon: '🌊',
        sources: 'Open-Meteo Copernicus DEM (90m) + GloFAS Global River Discharge',
        parameters: [
          { name: 'Topographic Elevation', desc: 'Digital Elevation Model identifies parcel elevation relative to local drainage basins.' },
          { name: 'River Discharge Stream', desc: 'Continuous GloFAS hydrological model monitors upstream river flow volumes (m³/s).' },
          { name: 'Soil Permeability & Infiltration', desc: 'Clay and dense soil types exhibit slower water infiltration, amplifying surface runoff.' },
        ],
        consequences: score > 60
          ? 'High likelihood of seasonal waterlogging, storm runoff inundation, and foundation moisture exposure during heavy rainfall events.'
          : score > 30
          ? 'Moderate inundation exposure during peak monsoon or regional cloudburst events; surface drainage required.'
          : 'Low historical flood hazard; natural surface gradient and elevation provide reliable stormwater runoff.',
        recommendations: [
          'Elevate foundation plinth height at least 2.5 to 3.5 feet above adjacent roadway level.',
          'Install perimeter French drains or high-capacity stormwater catchment swales.',
          'Ensure damp-proof coursing (DPC) and water-resistant subterranean foundation coatings.',
        ],
      }
    }

    if (key.includes('access') || key.includes('road')) {
      const roadW = landData?.road_width || landData?.road_width_ft
      const roadText = roadW ? `${roadW} ft corridor` : 'Corridor width data unavailable (topology evaluated)'

      return {
        title: 'Road Access & Transit Connectivity Assessment',
        icon: '🛣️',
        sources: 'OpenStreetMap (OSM) Highway Vectors & Right-of-Way Corridor Width',
        parameters: [
          { name: 'Right-of-Way Corridor Width', desc: `Calculated roadway width: ${roadText}. Determines turning radii and lane capacity.` },
          { name: 'Highway Hierarchy', desc: 'Classification in OpenStreetMap (residential, secondary, primary, tertiary) evaluating traffic velocity.' },
          { name: 'Emergency Vehicle Transit', desc: 'Fire tenders, concrete mixers, and ambulances require minimum 24-30ft clearance.' },
        ],
        consequences: score > 60
          ? 'Narrow carriageway or constrained arterial access hampers construction equipment ingress and heavy vehicle turning.'
          : score > 30
          ? 'Standard residential road width; sufficient for individual vehicles with moderate heavy-vehicle maneuverability.'
          : 'Wide frontage and direct highway connectivity provide excellent accessibility for commercial transit and emergency fleets.',
        recommendations: [
          'Verify municipal road widening proposals and set aside required front setback margins.',
          'Design on-site parking bays to prevent vehicular congestion along the roadway frontage.',
          'Coordinate delivery logistics for heavy ready-mix concrete vehicles during off-peak traffic hours.',
        ],
      }
    }

    if (key.includes('infra')) {
      return {
        title: 'Municipal Utilities & Infrastructure Risk Assessment',
        icon: '⚡',
        sources: 'OpenStreetMap Power Transmission Grid & Municipal Water Topology',
        parameters: [
          { name: 'Electrical Grid Connectivity', desc: 'Proximity to high/low voltage transmission lines and local transformers.' },
          { name: 'Potable Water Distribution', desc: 'Access to public water supply pipelines or municipal distribution points.' },
          { name: 'Drainage & Sewage Network', desc: 'Presence of municipal underground sewage and stormwater lines.' },
        ],
        consequences: score > 60
          ? 'Significant infrastructure gap requiring private borewells, transformer installation, or decentralized septic systems.'
          : score > 30
          ? 'Moderate utility accessibility; local utility tie-ins required during initial site development.'
          : 'Fully integrated utility network with immediate proximity to power and water mains.',
        recommendations: [
          'Submit early utility sanction applications to municipal water and electricity distribution boards.',
          'Incorporate rainwater harvesting storage systems and solar energy infrastructure to offset utility requirements.',
          'Plan for on-site decentralized wastewater treatment (STP) if underground public sewage is unavailable.',
        ],
      }
    }

    // Environmental / Land Cover
    return {
      title: 'Environmental & Ecological Risk Assessment',
      icon: '🌿',
      sources: 'ESA WorldCover 2021 (10m Sentinel-1/2) + ISRIC SoilGrids 2.0',
      parameters: [
        { name: 'Satellite Land Cover Classification', desc: '10m resolution Sentinel optical/radar land cover mapping detects wetlands, forests, and scrubland.' },
        { name: 'Soil Foundation Mechanics', desc: 'ISRIC WRB taxonomy assesses shrink-swell potential and bearing capacity.' },
        { name: 'Ecological Conservation Proximity', desc: 'Screens for protected coastal regulation zones, water body buffer margins, and eco-sensitive zones.' },
      ],
      consequences: score > 60
        ? 'High ecological sensitivity or poor foundation bearing capacity requiring specialized deep piling and environmental scrutiny.'
        : score > 30
        ? 'Standard environmental considerations; normal soil stabilization and vegetation management required.'
        : 'Stable environmental classification with favorable construction soil properties and zero ecological clearance impediments.',
      recommendations: [
        'Conduct standard geotechnical soil borehole investigation before final foundation engineering.',
        'Respect environmental buffer zones if located within 100 meters of water channels or wetlands.',
        'Preserve mature native trees within plot boundary setbacks to maintain natural microclimate cooling.',
      ],
    }
  }

  const details = getFactorDetails()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeUp">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 bg-slate-100 rounded-xl">{details.icon}</span>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-snug">{details.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Physical calculation basis & engineering recommendations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Score & Weight Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div>
            <span className="text-xs text-slate-500 font-semibold block">Calculated Risk Index</span>
            <span className="text-2xl font-black text-slate-900">{Math.round(score)}%</span>
            {weight != null && (
              <span className="text-[11px] text-slate-500 ml-1 font-medium">({weight}% of overall risk)</span>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${riskLevel.color}`}>
            {riskLevel.label}
          </span>
        </div>

        {/* Specific Why Explanation */}
        {whyReason && (
          <div className="p-3 bg-blue-50/60 border border-blue-200/70 rounded-xl text-xs text-blue-900 leading-relaxed">
            <strong className="block text-blue-950 font-bold mb-1">📍 Site-Specific Physical Analysis:</strong>
            {whyReason}
          </div>
        )}

        {/* Evaluated Factors */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Evaluated Physical Parameters</h4>
          <div className="space-y-2">
            {details.parameters.map((p, idx) => (
              <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                <span className="font-bold text-slate-800 block">{p.name}</span>
                <span className="text-slate-600 leading-snug mt-0.5 block">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Potential Impact */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Site Impact & Feasibility</h4>
          <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/60 border border-amber-200/70 p-3 rounded-xl">
            {details.consequences}
          </p>
        </div>

        {/* Mitigation Recommendations */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Engineering Mitigations</h4>
          <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
            {details.recommendations.map((r, idx) => (
              <li key={idx} className="leading-snug">
                <span className="font-medium text-slate-800">{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Source & Transparency */}
        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Source: {details.sources}</span>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-sm"
        >
          Close Explanation
        </button>
      </div>
    </div>
  )
}
