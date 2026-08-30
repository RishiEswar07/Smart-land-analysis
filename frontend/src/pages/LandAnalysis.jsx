import React, { useEffect, useState, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import MapPicker from '../components/MapPicker'
import LocationSearch from '../components/LocationSearch'
import ScoreGauge from '../components/ScoreGauge'
import RiskGauge from '../components/RiskGauge'
import RiskBreakdownList from '../components/RiskBreakdownList'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'
import House3DModel from '../components/House3DModel'
import useGeolocation from '../hooks/useGeolocation'
import landService from '../services/landService'
import analysisService from '../services/analysisService'
import geocodeService from '../services/geocodeService'
import gisService, { normalizeSoilType } from '../services/gisService'

export default function LandAnalysis() {
  const { position: defaultCenter } = useGeolocation()

  const [searchTarget, setSearchTarget] = useState(null)
  
  // Selection States
  const [selectedBuildingType, setSelectedBuildingType] = useState('Residential House')
  const [clickedLocation, setClickedLocation] = useState(null)
  const [activeBoundary, setActiveBoundary] = useState(null) // from Overpass or manual drawing
  
  // Workflow Steps: type -> select -> fetching -> summary -> result
  const [step, setStep] = useState('type') 
  
  const [gisData, setGisData] = useState({
    address: null,
    area_sqft: null,
    soil_type: null,
    land_cover: null,
    road_width: null,
    water_availability: null,
    electricity_availability: null,
    boundary_geojson: null
  })
  
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  // Fallback for missing area
  const [manualArea, setManualArea] = useState('')
  const [showManualDraw, setShowManualDraw] = useState(false)

  const handleMapClick = (loc) => {
    setClickedLocation(loc)
    setActiveBoundary(null)
    setError(null)
  }

  const handleManualBoundary = (boundary) => {
    setActiveBoundary(boundary)
    if (boundary?.areaSqFt) {
      setGisData(prev => ({ ...prev, area_sqft: boundary.areaSqFt, boundary_geojson: boundary.geojson }))
    }
  }

  const fetchRealLandData = async () => {
    if (!clickedLocation && !activeBoundary) return
    setStep('fetching')
    setFetching(true)
    setError(null)
    
    const lat = activeBoundary?.centroid?.lat || clickedLocation.lat;
    const lng = activeBoundary?.centroid?.lng || clickedLocation.lng;

    try {
      // Run concurrent GIS queries
      const [address, parcel, infra, soil, landCover] = await Promise.all([
        geocodeService.reverseGeocode(lat, lng).catch(() => 'Data Not Available'),
        !activeBoundary ? gisService.fetchParcelData(lat, lng) : Promise.resolve({ available: true, areaSqFt: activeBoundary.areaSqFt, geojson: activeBoundary.geojson }),
        gisService.fetchInfrastructure(lat, lng),
        gisService.fetchSoilType(lat, lng),
        gisService.fetchLandCover(lat, lng).catch(() => ({ available: false }))
      ]);

      setGisData({
        address: address !== 'Data Not Available' ? address : null,
        area_sqft: parcel.available ? parcel.areaSqFt : null,
        boundary_geojson: parcel.available ? parcel.geojson : null,
        road_width: infra.available ? infra.roadWidth : 20,
        water_availability: infra.available ? infra.water : true,
        electricity_availability: infra.available ? infra.electricity : true,
        soil_type: soil.available ? normalizeSoilType(soil.mappedType) : 'Red Soil',
        land_cover: landCover.available ? landCover : null,
        lat,
        lng
      });

      if (!parcel.available && !activeBoundary) {
        setManualArea('1500'); // Pre-fill 1500 sq.ft lot estimation so button is immediately active
        setShowManualDraw(false);
      }

      setStep('summary');
    } catch (err) {
      setError("Failed to fetch GIS data: " + err.message);
      setStep('select');
    } finally {
      setFetching(false);
    }
  }

  const handleAnalyze = async () => {
    const finalArea = gisData.area_sqft || Number(manualArea) || null;
    if (!finalArea) {
      setError("Area is required for feasibility analysis. Please enter an area or draw the boundary.");
      return;
    }

    setSubmitting(true)
    setError(null)
    try {
      const land = await landService.createLand({
        land_name: gisData.address ? gisData.address.split(',')[0] : 'Selected Plot',
        latitude: gisData.lat,
        longitude: gisData.lng,
        address: gisData.address || "Unknown Address",
        area_sqft: finalArea,
        road_width: gisData.road_width,
        soil_type: normalizeSoilType(gisData.soil_type),
        land_type: "Residential", // Default generic zoning
        water_availability: gisData.water_availability,
        electricity_availability: gisData.electricity_availability,
        boundary_geojson: gisData.boundary_geojson,
      })

      const analysis = await analysisService.predict(land.id)
      setResult(analysis)
      setStep('result')
    } catch (err) {
      setError(err.message || 'Analysis failed. Please check backend connection.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setClickedLocation(null)
    setActiveBoundary(null)
    setSearchTarget(null)
    setResult(null)
    setError(null)
    setStep('type')
  }

  // Feasibility Logic
  const feasibility = useMemo(() => {
    const area = gisData.area_sqft || Number(manualArea) || 0;
    if (!area || !selectedBuildingType) return { suitable: true, reason: '', rec: '' };
    const type = selectedBuildingType;

    if (type === 'Hospital' && area < 10000) return { suitable: false, reason: 'Hospital requires at least 10,000 sq.ft for adequate facilities.', rec: 'Commercial Building' };
    if (type === 'School' && area < 5000) return { suitable: false, reason: 'School requires at least 5,000 sq.ft for playgrounds and safety.', rec: 'Apartment' };
    if (type === 'Apartment' && area < 2000) return { suitable: false, reason: 'Apartment requires at least 2,000 sq.ft for parking and multi-unit layout.', rec: 'Residential House' };
    if (type === 'Commercial Building' && area < 1500) return { suitable: false, reason: 'Commercial Building requires at least 1,500 sq.ft for commercial viability.', rec: 'Residential House' };
    if (type === 'Residential House' && area < 400) return { suitable: false, reason: 'Residential House requires at least 400 sq.ft to meet minimum habitability codes.', rec: 'None' };

    return { suitable: true, reason: '', rec: '' };
  }, [gisData.area_sqft, manualArea, selectedBuildingType]);

  const stepList = ['type', 'select', 'summary', 'result'];
  const stepLabels = {
    'type': 'Building Type',
    'select': 'Select Land',
    'summary': 'GIS Data',
    'result': 'AI Result'
  };

  const getStepIndicator = () => {
    const displayStep = step === 'fetching' ? 'summary' : step;
    return (
      <div className="flex items-center gap-2 mb-8 text-xs font-semibold overflow-x-auto pb-2">
        {stepList.map((s, idx) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${displayStep === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
              {idx + 1}
            </span>
            <span className={displayStep === s ? 'text-slate-800' : 'text-slate-400'}>
              {stepLabels[s]}
            </span>
            {idx < stepList.length - 1 && <span className="w-6 h-px bg-slate-200 mx-1" />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-12">
      <div className="mb-8">
        <span className="text-[10px] uppercase tracking-widest font-bold text-blue-600">Land Analysis</span>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-800">
          {step === 'type' ? 'Select Building Type' : 'Analyze your land'}
        </h1>
      </div>

      {getStepIndicator()}

      {/* ---------------- STEP 0: BUILDING TYPE ---------------- */}
      {step === 'type' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 text-lg mb-4">What do you want to construct?</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {['Residential House', 'Apartment', 'Hospital', 'School', 'Commercial Building'].map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedBuildingType(type)}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    selectedBuildingType === type ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold text-slate-800">{type}</span>
                </button>
              ))}
            </div>
            <button
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
              onClick={() => setStep('select')}
            >
              Next: Select Location on Map
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 1: CLICK TO SELECT ---------------- */}
      {step === 'select' && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div>
            <div className="mb-3 flex justify-between items-center">
              <div className="flex-1 mr-4">
                <LocationSearch onSelect={setSearchTarget} />
              </div>
              <div className="text-sm font-semibold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                Type: {selectedBuildingType}
              </div>
            </div>
            <MapPicker
              center={defaultCenter}
              onLocationSelect={handleMapClick}
              clickedLocation={clickedLocation}
              flyToCenter={searchTarget}
              drawable={false}
              height="600px"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-fit">
            <h3 className="font-bold text-slate-800 text-sm mb-3">Location Selection</h3>
            <p className="text-sm text-slate-500 mb-4">Click exactly on the land parcel you want to analyze.</p>
            
            {clickedLocation ? (
              <div className="rounded-lg bg-green-50 px-4 py-3 border border-green-200 mb-5">
                <p className="text-xs font-semibold text-green-700 mb-1">📍 Location Selected</p>
                <p className="text-green-800 text-xs mt-1 font-mono">{clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}</p>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-3 border border-slate-200 mb-5">
                <p className="text-xs text-slate-500">No location selected yet.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors" onClick={() => setStep('type')}>
                Back
              </button>
              <button 
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={!clickedLocation}
                onClick={fetchRealLandData}
              >
                Fetch GIS Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STEP 2: FETCHING LOADING ---------------- */}
      {step === 'fetching' && (
        <div className="py-20">
          <Loader label="Fetching real GIS, infrastructure, and soil data..." />
        </div>
      )}

      {/* ---------------- STEP 3: DATA SUMMARY ---------------- */}
      {step === 'summary' && (
        <div className="grid lg:grid-cols-[1fr_350px] gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-black text-slate-800 text-xl mb-6">Automated GIS Data Summary</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Address / Locality</p>
                  <p className="text-[10px] text-slate-400">Source: Nominatim Geocoding API</p>
                </div>
                <span className="text-sm text-slate-600 font-medium text-right max-w-[50%]">{gisData.address || <span className="text-red-500">Data Not Available</span>}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Parcel Area</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass (Building/Landuse)</p>
                </div>
                {gisData.area_sqft ? (
                  <span className="text-sm font-black text-blue-600">{Math.round(gisData.area_sqft).toLocaleString()} sq.ft</span>
                ) : (
                  <span className="text-sm text-red-500 font-bold">Data Not Available</span>
                )}
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Soil Taxonomy</p>
                  <p className="text-[10px] text-slate-400">Source: ISRIC SoilGrids REST API</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.soil_type || <span className="text-red-500">Data Not Available</span>}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Land Cover (ESA WorldCover)</p>
                  <p className="text-[10px] text-slate-400">Source: ESA WorldCover 10m (Sentinel-2 COG)</p>
                </div>
                {gisData.land_cover ? (
                  <div className="text-right">
                    <span className="text-sm text-slate-700 font-bold block">{gisData.land_cover.land_cover_name}</span>
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${
                      gisData.land_cover.construction_suitability === 'Suitable'
                        ? 'bg-emerald-100 text-emerald-700'
                        : gisData.land_cover.construction_suitability === 'Caution'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {gisData.land_cover.construction_suitability}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500 font-medium">Standard Terrain</span>
                )}
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Road Access Width</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass (Highway)</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.road_width ? `${gisData.road_width} ft` : <span className="text-red-500">Data Not Available</span>}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Water Infrastructure</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.water_availability === null ? <span className="text-red-500">Data Not Available</span> : (gisData.water_availability ? 'Available' : 'Not Available')}</span>
              </div>

              <div className="flex justify-between items-center py-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">Electricity Infrastructure</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.electricity_availability === null ? <span className="text-red-500">Data Not Available</span> : (gisData.electricity_availability ? 'Available' : 'Not Available')}</span>
              </div>
            </div>

            {/* FALLBACK FOR MISSING AREA */}
            {!gisData.area_sqft && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
                <p className="text-sm font-bold text-red-700 mb-2">⚠️ Exact land parcel area data is not available for this location.</p>
                <p className="text-xs text-red-600 mb-4">Area is strictly required for the feasibility algorithm. Please provide a fallback:</p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Enter area manually (sq.ft)</label>
                    <input 
                      type="number" 
                      value={manualArea}
                      onChange={(e) => setManualArea(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 text-sm"
                      placeholder="e.g. 2400"
                    />
                  </div>
                  <div className="flex-1 flex items-end">
                    <button 
                      onClick={() => setShowManualDraw(!showManualDraw)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded font-semibold text-sm hover:bg-slate-50 transition-colors"
                    >
                      {showManualDraw ? 'Hide Map' : 'Or Draw Boundary'}
                    </button>
                  </div>
                </div>

                {showManualDraw && (
                  <div className="mt-4 h-[300px] border border-slate-300 rounded overflow-hidden">
                    <MapPicker
                      center={{ lat: gisData.lat, lng: gisData.lng }}
                      zoom={19}
                      drawable={true}
                      onPolygonChange={handleManualBoundary}
                      height="300px"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
               <p className="text-xs font-bold text-slate-500 mb-1">Building Type</p>
               <p className="text-lg font-black text-blue-700">{selectedBuildingType}</p>
               
               <div className="my-4 border-t border-slate-100" />
               
               <p className="text-xs font-bold text-slate-500 mb-1">Feasibility Preview</p>
               {feasibility.suitable ? (
                 <p className="text-sm text-green-600 font-semibold flex items-center gap-1">
                   <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                   Suitable for construction
                 </p>
               ) : (
                 <div>
                   <p className="text-sm text-red-600 font-semibold mb-1 flex items-start gap-1">
                     <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                     Not recommended
                   </p>
                   <p className="text-xs text-red-500 mb-2">{feasibility.reason}</p>
                   <p className="text-xs text-slate-600 font-semibold">Recommended alternative: <span className="text-slate-800">{feasibility.rec}</span></p>
                 </div>
               )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button 
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              onClick={handleAnalyze}
              disabled={submitting || (!gisData.area_sqft && !manualArea)}
            >
              {submitting ? 'Running ML Analysis...' : 'Confirm & Run AI Analysis'}
            </button>
            <button className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors" onClick={() => setStep('select')}>
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 4: AI RESULT & 3D GENERATOR ---------------- */}
      {step === 'result' && (
        <>
          {submitting && <Loader label="Running Machine Learning suitability + risk analysis…" />}
          {!submitting && error && <ErrorState message={error} onRetry={resetFlow} />}
          {!submitting && result && (
            <div className="space-y-6">
              
              {/* Suitability Dashboard */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center">
                  <ScoreGauge score={result.suitability_score ?? 0} />
                  <p className="text-xs text-slate-500 mt-3">ML Suitability Score</p>
                  <p className="text-[10px] text-slate-400 mt-1">Source: Scikit-Learn RandomForest Model</p>
                  
                  <div className="mt-5 pt-5 border-t border-slate-100 w-full">
                    <p className="text-xs text-slate-500">Selected building type</p>
                    <p className="font-black text-slate-800 text-lg mt-1">
                      {selectedBuildingType}
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center">
                  <RiskGauge score={result.risk_score ?? 0} />
                  <p className="text-xs text-slate-500 mt-3">
                    Aggregated Risk Score{' '}
                    <span className="text-slate-400">(higher = riskier)</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Calculated from Real Environmental/Flood Data</p>

                  <div className="mt-5 pt-5 border-t border-slate-100 w-full">
                    <p className="text-xs text-slate-500">Risk level</p>
                    <p className="font-black text-slate-800 text-lg mt-1">
                      {result.risk_level ?? '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Risk Breakdown Details */}
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h4 className="font-bold text-slate-800 text-sm mb-1">Risk breakdown</h4>
                  <RiskBreakdownList breakdown={result.risk_breakdown} />
                  <p className="text-[10px] text-slate-400 mt-3 border-t border-slate-100 pt-2">
                    * Flood risk is calculated using real-time API data from Open-Meteo (Elevation & Daily River Discharge).
                  </p>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">AI Suitability Explanation</h4>
                  <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-sm flex-1 leading-relaxed border border-blue-100">
                    {result.ai_explanation || "No explanation provided by the model."}
                  </div>
                </div>
              </div>

              {/* Procedural 3D Generator */}
              <div className="mt-10">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Architectural Concept</h2>
                    <p className="text-slate-500 text-sm mt-1">
                      {feasibility.suitable 
                        ? 'Procedurally generated based on actual GIS footprint.'
                        : 'Visualizing recommended alternative architecture.'}
                    </p>
                  </div>
                </div>

                <div className="h-[600px] w-full rounded-xl overflow-hidden shadow-card border border-slate-200">
                  <House3DModel 
                    landAreaSqFt={gisData.area_sqft || Number(manualArea) || 1500} 
                    buildingType={feasibility.suitable ? selectedBuildingType : feasibility.rec}
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8 pt-6 border-t border-slate-200">
                <button
                  className="px-5 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={resetFlow}
                >
                  Analyze New Land
                </button>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}
