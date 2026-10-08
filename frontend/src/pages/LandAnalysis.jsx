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
import DetailedLandAnalysisModal from '../components/DetailedLandAnalysisModal'
import useGeolocation from '../hooks/useGeolocation'
import landService from '../services/landService'
import analysisService from '../services/analysisService'
import geocodeService from '../services/geocodeService'
import gisService, { normalizeSoilType, calculatePolygonAreaSqFt, generateEstimatedParcel } from '../services/gisService'
import { pingBackend } from '../services/api'
import {
  INPUT_UNITS,
  convertAreaToSqFt,
  getAllAreaConversions,
  validatePlotFeasibility,
  calculateConstructionCost,
  BUILDING_REQUIREMENTS,
} from '../utils/areaUnits'

const STORAGE_KEY = 'smart_land_analysis_active_state';

const MIN_AREA_REQUIREMENTS = {
  'Hospital': { min: 10000, reason: 'Hospital requires at least 10,000 sq.ft for emergency bays, patient wards, and parking.', rec: 'Commercial Building' },
  'School': { min: 5000, reason: 'School requires at least 5,000 sq.ft for classrooms, safety setbacks, and student assembly grounds.', rec: 'Apartment' },
  'Apartment': { min: 2000, reason: 'Multi-unit Apartment requires at least 2,000 sq.ft for vertical layout, stairwells, and parking.', rec: 'Individual House' },
  'Commercial Building': { min: 1500, reason: 'Commercial Building requires at least 1,500 sq.ft for commercial viability and floor access.', rec: 'Individual House' },
  'Individual House': { min: 400, reason: 'Individual House requires at least 400 sq.ft to meet standard residential habitability and setback codes.', rec: 'None' },
  'Residential House': { min: 400, reason: 'Residential House requires at least 400 sq.ft to meet standard residential habitability and setback codes.', rec: 'None' }
};

export default function LandAnalysis() {
  const { position: defaultCenter } = useGeolocation()

  const [searchTarget, setSearchTarget] = useState(null)
  
  // Selection States with sessionStorage restoration
  const savedState = useMemo(() => {
    try {
      const item = sessionStorage.getItem(STORAGE_KEY);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }, []);

  const [selectedBuildingType, setSelectedBuildingType] = useState(savedState?.selectedBuildingType || 'Individual House')
  const [clickedLocation, setClickedLocation] = useState(savedState?.clickedLocation || null)
  const [activeBoundary, setActiveBoundary] = useState(savedState?.activeBoundary || null)
  
  // Area Input Mode: 'direct' or 'polygon'
  const [areaInputMode, setAreaInputMode] = useState(savedState?.areaInputMode || 'direct')
  const [directAreaValue, setDirectAreaValue] = useState(savedState?.directAreaValue || '2400')
  const [directAreaUnit, setDirectAreaUnit] = useState(savedState?.directAreaUnit || 'sq.ft')

  // Workflow Steps: type -> select -> fetching -> summary -> result
  const [step, setStep] = useState(savedState?.step || 'type') 
  
  const [gisData, setGisData] = useState(savedState?.gisData || {
    address: null,
    area_sqft: null,
    area: null,
    input_unit: 'sq.ft',
    area_source: 'direct_input',
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
  const [result, setResult] = useState(savedState?.result || null)
  const [showDetailedModal, setShowDetailedModal] = useState(false)

  // Non-blocking background ping on mount to wake Render container
  useEffect(() => {
    pingBackend()
  }, [])

  // Fallback for missing area in summary
  const [manualArea, setManualArea] = useState(savedState?.manualArea || '')
  const [showManualDraw, setShowManualDraw] = useState(false)

  // Live conversions for direct area input
  const liveConversions = useMemo(() => {
    if (areaInputMode === 'direct') {
      const rawVal = parseFloat(directAreaValue);
      if (!isNaN(rawVal) && rawVal > 0) {
        const sqft = convertAreaToSqFt(rawVal, directAreaUnit);
        return getAllAreaConversions(sqft);
      }
    } else if (activeBoundary?.areaSqFt) {
      return getAllAreaConversions(activeBoundary.areaSqFt);
    }
    return getAllAreaConversions(2400);
  }, [areaInputMode, directAreaValue, directAreaUnit, activeBoundary]);

  // Current calculated sq.ft value
  const currentCalculatedSqFt = useMemo(() => {
    if (areaInputMode === 'direct') {
      const rawVal = parseFloat(directAreaValue);
      return !isNaN(rawVal) && rawVal > 0 ? convertAreaToSqFt(rawVal, directAreaUnit) : 0;
    }
    return activeBoundary?.areaSqFt || 0;
  }, [areaInputMode, directAreaValue, directAreaUnit, activeBoundary]);

  // Sync state to sessionStorage whenever key properties change
  useEffect(() => {
    try {
      const stateToSave = {
        step: step === 'fetching' ? 'summary' : step,
        selectedBuildingType,
        clickedLocation,
        activeBoundary,
        areaInputMode,
        directAreaValue,
        directAreaUnit,
        gisData,
        manualArea,
        result
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Failed to persist analysis state:", e);
    }
  }, [step, selectedBuildingType, clickedLocation, activeBoundary, areaInputMode, directAreaValue, directAreaUnit, gisData, manualArea, result]);

  const handleMapClick = (loc) => {
    setClickedLocation(loc)
    if (areaInputMode === 'direct') {
      setActiveBoundary(null)
    }
    setError(null)
  }

  const handleManualBoundary = (boundary) => {
    setActiveBoundary(boundary)
    if (boundary?.areaSqFt) {
      const rounded = Math.round(boundary.areaSqFt);
      setManualArea(String(rounded));
      setGisData(prev => ({
        ...prev,
        area_sqft: boundary.areaSqFt,
        area: boundary.areaSqFt,
        input_unit: 'sq.ft',
        area_source: 'polygon',
        boundary_geojson: boundary.geojson,
        is_estimated: false,
      }))
    } else if (!boundary) {
      setActiveBoundary(null)
    }
  }

  const fetchRealLandData = async () => {
    if (!clickedLocation && !activeBoundary) {
      setError("Please select a location on the map.");
      return;
    }

    if (areaInputMode === 'direct') {
      const rawVal = parseFloat(directAreaValue);
      if (isNaN(rawVal) || rawVal <= 0) {
        setError("Please enter a valid positive land area greater than 0.");
        return;
      }
    }

    setStep('fetching')
    setFetching(true)
    setError(null)
    
    const lat = activeBoundary?.centroid?.lat || clickedLocation.lat;
    const lng = activeBoundary?.centroid?.lng || clickedLocation.lng;

    try {
      // Run concurrent GIS queries
      const [address, infra, soil, landCover] = await Promise.all([
        geocodeService.reverseGeocode(lat, lng).catch(() => 'Data Not Available'),
        gisService.fetchInfrastructure(lat, lng),
        gisService.fetchSoilType(lat, lng),
        gisService.fetchLandCover(lat, lng).catch(() => ({ available: false }))
      ]);

      let finalSqFt = 2400;
      let rawArea = 2400;
      let inputUnit = 'sq.ft';
      let areaSource = 'direct_input';
      let boundaryGeoJson = null;

      if (areaInputMode === 'direct') {
        rawArea = parseFloat(directAreaValue) || 2400;
        inputUnit = directAreaUnit || 'sq.ft';
        finalSqFt = convertAreaToSqFt(rawArea, inputUnit);
        areaSource = 'direct_input';
        boundaryGeoJson = null; // No fake polygon for direct input
      } else {
        if (activeBoundary?.areaSqFt && activeBoundary.areaSqFt > 0) {
          finalSqFt = Math.round(activeBoundary.areaSqFt);
          boundaryGeoJson = activeBoundary.geojson;
        } else {
          // If polygon mode was selected but user only clicked a point, compute estimated parcel
          const parcel = await gisService.fetchParcelData(lat, lng);
          finalSqFt = Math.round(parcel.areaSqFt);
          boundaryGeoJson = parcel.geojson;
        }
        rawArea = finalSqFt;
        inputUnit = 'sq.ft';
        areaSource = 'polygon';
      }

      setManualArea(String(finalSqFt));

      setGisData({
        address: address !== 'Data Not Available' ? address : null,
        area_sqft: finalSqFt,
        area: rawArea,
        input_unit: inputUnit,
        area_source: areaSource,
        boundary_geojson: boundaryGeoJson,
        is_estimated: areaInputMode === 'direct',
        road_width: infra.available ? infra.roadWidth : 20,
        water_availability: infra.available ? infra.water : true,
        electricity_availability: infra.available ? infra.electricity : true,
        soil_type: soil.available ? normalizeSoilType(soil.mappedType) : 'Red Soil',
        land_cover: landCover.available ? landCover : null,
        lat,
        lng
      });

      setStep('summary');
    } catch (err) {
      setError("Failed to fetch GIS data: " + (err.message || 'Unknown network error'));
      setStep('select');
    } finally {
      setFetching(false);
    }
  }

  const handleAnalyze = async () => {
    let finalSqFt = gisData.area_sqft;
    let rawArea = gisData.area;
    let inputUnit = gisData.input_unit || 'sq.ft';
    let areaSource = gisData.area_source || (areaInputMode === 'direct' ? 'direct_input' : 'polygon');
    let boundaryGeoJson = gisData.boundary_geojson;

    if (!finalSqFt || isNaN(Number(finalSqFt)) || Number(finalSqFt) <= 0) {
      if (manualArea) {
        finalSqFt = parseFloat(String(manualArea).replace(/,/g, '').trim()) || 2400;
        rawArea = finalSqFt;
        inputUnit = 'sq.ft';
      } else {
        finalSqFt = 2400;
        rawArea = 2400;
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const land = await landService.createLand({
        land_name: gisData.address ? gisData.address.split(',')[0].trim() : 'Selected Plot',
        latitude: gisData.lat || (clickedLocation?.lat ?? 0),
        longitude: gisData.lng || (clickedLocation?.lng ?? 0),
        address: gisData.address || "Unknown Address",
        area: rawArea,
        input_unit: inputUnit,
        area_source: areaSource,
        area_sqft: finalSqFt,
        road_width: gisData.road_width || 20,
        soil_type: normalizeSoilType(gisData.soil_type),
        land_type: "Residential",
        water_availability: gisData.water_availability !== null ? gisData.water_availability : true,
        electricity_availability: gisData.electricity_availability !== null ? gisData.electricity_availability : true,
        boundary_geojson: boundaryGeoJson,
      })

      const analysis = await analysisService.predict(land.id)
      setResult(analysis)
      setStep('result')
    } catch (err) {
      console.error("Analysis execution error:", err);
      setError(err.message || 'Analysis failed. Please ensure you are logged in and backend is connected.');
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Storage clear error:", e);
    }
    setClickedLocation(null)
    setActiveBoundary(null)
    setSearchTarget(null)
    setResult(null)
    setError(null)
    setManualArea('')
    setDirectAreaValue('2400')
    setDirectAreaUnit('sq.ft')
    setAreaInputMode('direct')
    setStep('type')
  }

  // Size Validation & Recommendations
  const sizeValidation = useMemo(() => {
    const currentArea = currentCalculatedSqFt || gisData.area_sqft || (manualArea ? parseFloat(manualArea) : 0) || 0;
    const req = MIN_AREA_REQUIREMENTS[selectedBuildingType];
    
    if (!req || !currentArea) {
      return { isUndersized: false, currentArea, minRequired: req?.min || 400 };
    }

    if (currentArea < req.min) {
      return {
        isUndersized: true,
        currentArea: Math.round(currentArea),
        minRequired: req.min,
        deficiency: Math.round(req.min - currentArea),
        reason: req.reason,
        rec: req.rec
      };
    }

    return {
      isUndersized: false,
      currentArea: Math.round(currentArea),
      minRequired: req.min
    };
  }, [currentCalculatedSqFt, gisData.area_sqft, manualArea, selectedBuildingType]);

  // Overall Feasibility Logic
  const feasibility = useMemo(() => {
    if (sizeValidation.isUndersized) {
      return {
        suitable: false,
        reason: sizeValidation.reason,
        rec: sizeValidation.rec
      };
    }
    return { suitable: true, reason: '', rec: '' };
  }, [sizeValidation]);

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
            <h3 className="font-bold text-slate-800 text-lg mb-2">What do you want to construct?</h3>
            <p className="text-xs text-slate-500 mb-6">Select your proposed development to evaluate minimum plot requirements and zoning suitability.</p>
            
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { name: 'Individual House', min: '400 sq.ft min', desc: 'Single-family standalone residence' },
                { name: 'Apartment', min: '2,000 sq.ft min', desc: 'Multi-family residential complex' },
                { name: 'Commercial Building', min: '1,500 sq.ft min', desc: 'Offices, retail, and complexes' },
                { name: 'School', min: '5,000 sq.ft min', desc: 'Educational institutions & campuses' },
                { name: 'Hospital', min: '10,000 sq.ft min', desc: 'Hospitals, clinics & health centers' },
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => setSelectedBuildingType(item.name)}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    selectedBuildingType === item.name ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className="font-bold text-slate-800 block text-sm">{item.name}</span>
                    <span className="text-xs text-slate-500 mt-0.5 block">{item.desc}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-600 mt-3 block">{item.min}</span>
                </button>
              ))}
            </div>

            <button
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-sm"
              onClick={() => setStep('select')}
            >
              Next: Select Location & Land Size →
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 1: SELECT LOCATION / DIRECT AREA / DRAW ---------------- */}
      {step === 'select' && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div>
            {/* Search and Top Bar */}
            <div className="mb-3 flex flex-wrap gap-2 justify-between items-center">
              <div className="flex-1 min-w-[240px] mr-2">
                <LocationSearch onSelect={setSearchTarget} />
              </div>
              <div className="text-xs font-semibold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                Type: {selectedBuildingType}
              </div>
            </div>

            {/* Mode Selector Tab: Direct Area Input vs Draw Boundary */}
            <div className="mb-3 bg-slate-100 p-1 rounded-xl flex border border-slate-200 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setAreaInputMode('direct');
                  setActiveBoundary(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  areaInputMode === 'direct'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🔢 Enter Land Area Directly</span>
              </button>
              <button
                type="button"
                onClick={() => setAreaInputMode('polygon')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  areaInputMode === 'polygon'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>✏️ Draw Boundary on Map</span>
              </button>
            </div>

            {/* Map Component */}
            <MapPicker
              center={defaultCenter}
              onLocationSelect={handleMapClick}
              clickedLocation={clickedLocation}
              activeBoundary={activeBoundary}
              onPolygonChange={handleManualBoundary}
              flyToCenter={searchTarget}
              drawable={areaInputMode === 'polygon'}
              height="580px"
            />
          </div>

          {/* Right Panel: Direct Area Form or Boundary Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-fit flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">
                {areaInputMode === 'direct' ? '1. Enter Land Area Directly' : '1. Draw Boundary on Map'}
              </h3>
              <p className="text-xs text-slate-500">
                {areaInputMode === 'direct'
                  ? 'Click your land location on the map, then enter the numeric size and measurement unit below.'
                  : 'Click 3 or more points on the map to enclose the parcel boundary, then click Finish Shape.'}
              </p>
            </div>

            {/* DIRECT AREA INPUT FORM */}
            {areaInputMode === 'direct' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-700 mb-1 block">
                      Land Area <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={directAreaValue}
                      onChange={(e) => setDirectAreaValue(e.target.value)}
                      placeholder="e.g. 2400"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Unit</label>
                    <select
                      value={directAreaUnit}
                      onChange={(e) => setDirectAreaUnit(e.target.value)}
                      className="w-full px-2 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {INPUT_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 4-UNIT CONVERSION PREVIEW CARD */}
                <div className="rounded-lg bg-blue-50/70 p-3 border border-blue-200/80 text-xs">
                  <span className="font-bold text-blue-900 block mb-1 text-[11px] uppercase tracking-wider">
                    🔄 Live Unit Conversions
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                    <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                      <span className="text-slate-400 block text-[10px]">Square Feet</span>
                      <strong className="text-blue-700 text-xs">{liveConversions.sqft.toLocaleString()} sq.ft</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                      <span className="text-slate-400 block text-[10px]">Square Meters</span>
                      <strong className="text-slate-800 text-xs">{liveConversions.sqm.toLocaleString()} m²</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                      <span className="text-slate-400 block text-[10px]">Cents</span>
                      <strong className="text-slate-800 text-xs">{liveConversions.cents} cents</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                      <span className="text-slate-400 block text-[10px]">Acres</span>
                      <strong className="text-slate-800 text-xs">{liveConversions.acres} acres</strong>
                    </div>
                  </div>
                </div>

                {/* INFORMATIONAL NOTE */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-700">ℹ️ Note:</span> When entering area directly, GIS and flood analysis are evaluated based on the representative location point on the map, rather than an exact polygon boundary.
                </div>
              </div>
            ) : (
              /* POLYGON BOUNDARY SUMMARY */
              <div>
                {activeBoundary && activeBoundary.areaSqFt ? (
                  <div className="rounded-lg bg-blue-50 px-4 py-3 border border-blue-200">
                    <p className="text-xs font-semibold text-blue-700 mb-1">📐 Custom Polygon Drawn</p>
                    <p className="text-blue-900 text-sm font-black">
                      {Math.round(activeBoundary.areaSqFt).toLocaleString()} sq.ft
                    </p>
                    <p className="text-blue-600 text-[11px] mt-0.5 font-mono">
                      {activeBoundary.centroid?.lat?.toFixed(5)}, {activeBoundary.centroid?.lng?.toFixed(5)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 px-4 py-3 border border-slate-200 text-xs text-slate-500">
                    Click the polygon points on the map to calculate exact geodesic area.
                  </div>
                )}
              </div>
            )}

            {/* SELECTED POINT BADGE */}
            {clickedLocation ? (
              <div className="rounded-lg bg-green-50 px-3.5 py-2.5 border border-green-200 text-xs">
                <p className="font-semibold text-green-800 mb-0.5">📍 Representative Location Point</p>
                <p className="text-green-700 font-mono text-[11px]">{clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}</p>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 px-3.5 py-2.5 border border-amber-200 text-xs text-amber-800">
                ⚠️ Please click on the map to select the land location.
              </div>
            )}

            {/* SIZE VALIDATION WARNING ON MAP SELECTION */}
            {sizeValidation.isUndersized && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-900">
                  <span>⚠️ Area Warning</span>
                </div>
                <p className="leading-snug">
                  Entered area (<strong>{sizeValidation.currentArea.toLocaleString()} sq.ft</strong>) is smaller than the minimum <strong>{sizeValidation.minRequired.toLocaleString()} sq.ft</strong> required for a <strong>{selectedBuildingType}</strong>.
                </p>
                {sizeValidation.rec && sizeValidation.rec !== 'None' && (
                  <p className="mt-1 text-amber-700 font-medium">
                    💡 Suggested: Consider a {sizeValidation.rec}.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded border border-rose-200">{error}</p>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button 
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors" 
                onClick={() => setStep('type')}
              >
                Back
              </button>
              <button 
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                disabled={!clickedLocation && !activeBoundary}
                onClick={fetchRealLandData}
              >
                Fetch GIS Data →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STEP 2: FETCHING LOADING ---------------- */}
      {step === 'fetching' && (
        <div className="py-20">
          <Loader label="Fetching real GIS, Open-Meteo flood metrics, and soil data..." />
        </div>
      )}

      {/* ---------------- STEP 3: DATA SUMMARY ---------------- */}
      {step === 'summary' && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-black text-slate-800 text-xl mb-6">Automated GIS Data Summary</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Address / Locality</p>
                  <p className="text-[10px] text-slate-400">Source: Nominatim Geocoding API</p>
                </div>
                <span className="text-sm text-slate-600 font-medium text-right max-w-[50%]">
                  {gisData.address || <span className="text-slate-400">Coordinates ({gisData.lat?.toFixed(4)}, {gisData.lng?.toFixed(4)})</span>}
                </span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Parcel Area & Provenance</p>
                  <p className="text-[10px] text-slate-400">
                    Source: {gisData.area_source === 'direct_input' ? 'User-entered Land Area' : 'Selected Land Boundary'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-blue-600 block">
                    {Math.round(gisData.area_sqft || manualArea || 2400).toLocaleString()} sq.ft
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium block">
                    {((gisData.area_sqft || 2400) / 10.7639).toFixed(1)} m² · {((gisData.area_sqft || 2400) / 435.6).toFixed(2)} cents · {((gisData.area_sqft || 2400) / 43560).toFixed(4)} acres
                  </span>
                  <span className="inline-block text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full mt-0.5">
                    {gisData.area_source === 'direct_input' ? `Direct Input (${gisData.area || gisData.area_sqft} ${gisData.input_unit || 'sq.ft'})` : 'Polygon Boundary'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Soil Taxonomy</p>
                  <p className="text-[10px] text-slate-400">Source: ISRIC SoilGrids REST API</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.soil_type || 'Red Soil'}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Land Cover (ESA WorldCover)</p>
                  <p className="text-[10px] text-slate-400">Source: ESA WorldCover 10m (Sentinel-2 COG)</p>
                </div>
                {gisData.land_cover && gisData.land_cover.land_cover_name ? (
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
                <span className="text-sm text-slate-600 font-medium">{gisData.road_width ? `${gisData.road_width} ft` : '20 ft'}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">Water Infrastructure</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.water_availability !== false ? 'Available' : 'Not Available'}</span>
              </div>

              <div className="flex justify-between items-center py-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">Electricity Infrastructure</p>
                  <p className="text-[10px] text-slate-400">Source: OpenStreetMap / Overpass</p>
                </div>
                <span className="text-sm text-slate-600 font-medium">{gisData.electricity_availability !== false ? 'Available' : 'Not Available'}</span>
              </div>
            </div>

            {/* OPTIONAL CUSTOMIZATION / ADJUSTMENT */}
            <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-800">Customize Area / Switch to Map Drawing</p>
                <span className="text-xs text-slate-500 font-medium">Current: {Math.round(gisData.area_sqft || manualArea || 0).toLocaleString()} sq.ft</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">You can adjust the area in sq.ft below or draw a custom boundary directly on the map:</p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-700 mb-1 block">Adjust area (sq.ft)</label>
                  <input 
                    type="number" 
                    value={manualArea}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualArea(val);
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed) && parsed > 0) {
                        setGisData(prev => ({ ...prev, area_sqft: parsed, area: parsed, input_unit: 'sq.ft', is_estimated: false }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:border-blue-500 text-sm font-medium bg-white"
                    placeholder="e.g. 2400"
                  />
                </div>
                <div className="flex-1 flex items-end">
                  <button 
                    onClick={() => setShowManualDraw(!showManualDraw)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded font-semibold text-sm hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    {showManualDraw ? 'Hide Map Drawing' : '✏️ Draw Custom Boundary'}
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
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-500 mb-1">Target Development</p>
              <p className="text-lg font-black text-blue-700">{selectedBuildingType}</p>
              
              <div className="my-4 border-t border-slate-100" />
              
              <p className="text-xs font-bold text-slate-500 mb-1">Feasibility & Size Check</p>
              
              {sizeValidation.isUndersized ? (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-1 font-bold text-amber-800 mb-1">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>Plot Undersized for {selectedBuildingType}</span>
                  </div>
                  <p className="leading-relaxed mb-2">
                    Current plot size is <strong>{sizeValidation.currentArea.toLocaleString()} sq.ft</strong>. The minimum standard required is <strong>{sizeValidation.minRequired.toLocaleString()} sq.ft</strong> (deficit of {sizeValidation.deficiency.toLocaleString()} sq.ft).
                  </p>
                  {sizeValidation.rec && sizeValidation.rec !== 'None' && (
                    <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                      <span className="text-[11px] text-amber-800 font-medium">Recommended: <strong>{sizeValidation.rec}</strong></span>
                      <button
                        onClick={() => setSelectedBuildingType(sizeValidation.rec)}
                        className="text-[10px] font-bold px-2 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded transition-colors"
                      >
                        Switch Type
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-600 font-semibold flex items-center gap-1.5 mt-2">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Area meets building requirements ({Math.round(gisData.area_sqft || manualArea || 2400).toLocaleString()} sq.ft)
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <button 
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 shadow-md flex items-center justify-center gap-2"
              onClick={handleAnalyze}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Running ML Analysis...</span>
                </>
              ) : (
                <span>Confirm & Run AI Analysis →</span>
              )}
            </button>
            <button 
              className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors" 
              onClick={() => setStep('select')}
            >
              Change Location / Area
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 4: AI RESULT & 3D GENERATOR ---------------- */}
      {step === 'result' && (
        <>
          {submitting && <Loader label="Running Machine Learning suitability + risk analysis…" />}
          {!submitting && error && <ErrorState message={error} onRetry={() => setStep('summary')} />}
          {!submitting && result && (
            <div className="space-y-6">
              
              {/* Suitability Dashboard */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div 
                  onClick={() => setShowDetailedModal(true)}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group relative"
                  title="Click to view detailed factor breakdown and transparent scores"
                >
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Click to Inspect 🔍
                    </span>
                  </div>

                  <ScoreGauge score={result.suitability_score ?? 0} />
                  <p className="text-xs text-slate-500 mt-3 font-semibold">ML Suitability Score</p>
                  <span className="text-[11px] font-bold text-blue-600 group-hover:underline mt-0.5 inline-flex items-center gap-1">
                    Click for detailed factor breakdown →
                  </span>
                  
                  <div className="mt-5 pt-5 border-t border-slate-100 w-full">
                    <p className="text-xs text-slate-500">Selected building type</p>
                    <p className="font-black text-slate-800 text-lg mt-1">
                      {selectedBuildingType}
                    </p>
                    {result.recommended_building_type && result.recommended_building_type !== selectedBuildingType && (
                      <div className="mt-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 py-1 px-3 rounded-full">
                        AI Recommended: {result.recommended_building_type}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center">
                  <RiskGauge score={result.risk_score ?? 0} />
                  <p className="text-xs text-slate-500 mt-3">
                    Aggregated Risk Score{' '}
                    <span className="text-slate-400">(higher = riskier)</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Calculated from Real Environmental & Hydrology Data</p>

                  <div className="mt-5 pt-5 border-t border-slate-100 w-full">
                    <p className="text-xs text-slate-500">Risk level</p>
                    <p className="font-black text-slate-800 text-lg mt-1">
                      {result.risk_level ?? 'Low'}
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
                    * Flood risk is calculated using live Open-Meteo elevation & river discharge hydrology.
                  </p>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">AI Suitability Explanation</h4>
                  <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-sm flex-1 leading-relaxed border border-blue-100">
                    {result.ai_explanation || "Feasibility assessment completed successfully based on GIS and satellite spatial parameters."}
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
                        ? 'Procedurally generated 3D concept based on actual GIS footprint.'
                        : 'Visualizing recommended alternative architecture.'}
                    </p>
                  </div>
                </div>

                <div className="h-[600px] w-full rounded-xl overflow-hidden shadow-card border border-slate-200">
                  <House3DModel 
                    landAreaSqFt={gisData.area_sqft || (manualArea ? parseFloat(manualArea) : 2400)} 
                    buildingType={feasibility.suitable ? selectedBuildingType : (feasibility.rec || 'Residential House')}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-8 pt-6 border-t border-slate-200">
                <button
                  className="px-5 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                  onClick={() => setShowDetailedModal(true)}
                >
                  <span>📊 Generate Land Analysis Report</span>
                </button>
                <button
                  className="px-5 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={resetFlow}
                >
                  Analyze New Land
                </button>
                <button
                  className="px-5 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={() => setStep('summary')}
                >
                  Review GIS Summary
                </button>
              </div>

              {/* Detailed Breakdown & Export Modal */}
              <DetailedLandAnalysisModal
                isOpen={showDetailedModal}
                onClose={() => setShowDetailedModal(false)}
                analysisId={result.id}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
