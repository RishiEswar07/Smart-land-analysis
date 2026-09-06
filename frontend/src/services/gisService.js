import axios from 'axios';
import area from '@turf/area';
import centroid from '@turf/centroid';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const SOILGRIDS_API = 'https://rest.isric.org/soilgrids/v2.0/classification/query';

import api from './api';

// Mapping WRB Soil classes and keywords to our project types
export const mapSoilType = (wrbClassName) => {
  const name = (wrbClassName || '').toLowerCase();
  if (name.includes('vertisol') || name.includes('black cotton') || name.includes('black') || name.includes('regur')) return 'Black Cotton';
  if (name.includes('acrisol') || name.includes('ferralsol') || name.includes('nitisol') || name.includes('lixisol') || name.includes('red soil') || name.includes('red')) return 'Red Soil';
  if (name.includes('clayey') || name.includes('clay') || name.includes('gleysol') || name.includes('fluvisol') || name.includes('stagnosol') || name.includes('planosol')) return 'Clayey';
  if (name.includes('arenosol') || name.includes('podzol') || name.includes('sandy') || name.includes('sand')) return 'Sandy';
  if (name.includes('leptosol') || name.includes('regosol') || name.includes('rocky') || name.includes('rock')) return 'Rocky';
  if (name.includes('cambisol') || name.includes('luvisol') || name.includes('phaeozem') || name.includes('kastanozem') || name.includes('loamy') || name.includes('loam') || name.includes('silt')) return 'Loamy';
  return 'Loamy'; // Default generic
};

// Clean, normalize, and extract first valid soil type from any compound string (e.g. 'Red Soil / Loamy')
export const normalizeSoilType = (rawSoil) => {
  if (!rawSoil || typeof rawSoil !== 'string') return 'Loamy';

  // Split by slashes, commas, dashes, pluses, parentheses, and/or keywords
  const tokens = rawSoil.split(/[\/\\|;,+&()]|\band\b|\bor\b/i).map(t => t.trim()).filter(Boolean);

  for (const token of tokens) {
    const mapped = mapSoilType(token);
    if (mapped) return mapped;
  }

  return mapSoilType(rawSoil);
};

/**
 * Dynamically computes a fallback geometric parcel polygon and area
 * around the clicked coordinates (in square feet).
 */
export const generateEstimatedParcel = (lat, lng, sideLengthMeters = 15) => {
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.max(Math.cos(latRad), 0.0001);

  const halfLat = (sideLengthMeters / 2) / metersPerDegLat;
  const halfLng = (sideLengthMeters / 2) / metersPerDegLng;

  const minLat = lat - halfLat;
  const maxLat = lat + halfLat;
  const minLng = lng - halfLng;
  const maxLng = lng + halfLng;

  const coords = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat]
  ];

  const geojson = {
    type: 'Feature',
    properties: {
      isEstimated: true,
      center: [lng, lat],
      sideLengthMeters
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };

  const sqMeters = area(geojson);
  const areaSqFt = sqMeters * 10.7639104;

  return {
    available: true,
    isEstimated: true,
    source: `Geometric Bounding Calculation (${sideLengthMeters}m Lot)`,
    coords: coords.map(c => ({ lat: c[1], lng: c[0] })),
    areaSqFt: Math.round(areaSqFt * 10) / 10,
    geojson
  };
};

// Centralized Building Requirements and Minimum Plot Sizes
export const BUILDING_REQUIREMENTS = {
  'Individual House': { minSqFt: 400, label: 'Individual House', rate: 2000, description: 'Single-family standalone residence' },
  'Apartment': { minSqFt: 2000, label: 'Apartment', rate: 2200, description: 'Multi-story residential apartment complex' },
  'Commercial Building': { minSqFt: 1500, label: 'Commercial Building', rate: 2500, description: 'Retail, commercial office or business hub' },
  'School': { minSqFt: 5000, label: 'School', rate: 2000, description: 'Educational campus with classrooms and grounds' },
  'Hospital': { minSqFt: 10000, label: 'Hospital', rate: 3000, description: 'Multi-tier healthcare facility with emergency bays' },
};

/**
 * Accurately calculates geodesic polygon area in square meters, square feet, and cents.
 * Single source of truth for all area measurements.
 */
export const calculateGeodesicArea = (coords) => {
  if (!coords || coords.length < 3) {
    return { sqMeters: 0, sqFt: 0, cents: 0 };
  }

  let sqMeters = 0;

  try {
    const formatted = coords.map(c => [c.lng ?? c[0], c.lat ?? c[1]]);
    if (
      formatted[0][0] !== formatted[formatted.length - 1][0] ||
      formatted[0][1] !== formatted[formatted.length - 1][1]
    ) {
      formatted.push(formatted[0]);
    }

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [formatted]
      }
    };

    sqMeters = area(geojson);
  } catch (err) {
    console.warn('Turf area calculation error, using geodesic shoelace fallback:', err);
    // Geodesic Shoelace Fallback
    try {
      const rad = Math.PI / 180;
      const R = 6378137;
      let totalArea = 0;
      const n = coords.length;
      for (let i = 0; i < n; i++) {
        const p1 = coords[i];
        const p2 = coords[(i + 1) % n];
        const lat1 = (p1.lat ?? p1[1]) * rad;
        const lat2 = (p2.lat ?? p2[1]) * rad;
        const lng1 = (p1.lng ?? p1[0]) * rad;
        const lng2 = (p2.lng ?? p2[0]) * rad;
        totalArea += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
      }
      sqMeters = Math.abs((totalArea * (R * R)) / 2.0);
    } catch (e) {
      sqMeters = 222.96; // fallback 2400 sqft
    }
  }

  if (isNaN(sqMeters) || sqMeters <= 0) {
    sqMeters = 0;
  }

  const sqFt = sqMeters * 10.7639104;
  const cents = sqFt / 435.6;

  return {
    sqMeters: Math.round(sqMeters * 10) / 10,
    sqFt: Math.round(sqFt * 10) / 10,
    cents: Math.round(cents * 100) / 100
  };
};

/**
 * Validates plot size against target building requirements.
 */
export const validatePlotSize = (buildingType, areaSqFt) => {
  const normType = Object.keys(BUILDING_REQUIREMENTS).find(
    k => k.toLowerCase() === (buildingType || '').toLowerCase()
  ) || 'Individual House';

  const req = BUILDING_REQUIREMENTS[normType] || BUILDING_REQUIREMENTS['Individual House'];
  const minRequired = req.minSqFt;
  const actual = Number(areaSqFt) || 0;
  const isValid = actual >= minRequired;
  const diff = actual - minRequired;

  return {
    isValid,
    buildingType: normType,
    requiredMinSqFt: minRequired,
    actualSqFt: actual,
    deficitOrSurplusSqFt: Math.abs(diff),
    status: isValid ? 'SUITABLE' : 'DEFICIT',
    message: isValid
      ? `Plot area (${actual.toLocaleString()} sq.ft) meets or exceeds the minimum required (${minRequired.toLocaleString()} sq.ft) for ${normType}. (+${Math.round(diff).toLocaleString()} sq.ft surplus)`
      : `Plot area (${actual.toLocaleString()} sq.ft) is below the minimum required (${minRequired.toLocaleString()} sq.ft) for ${normType}. Deficit of ${Math.round(Math.abs(diff)).toLocaleString()} sq.ft.`
  };
};

/**
 * Calculates indicative construction cost with 55% material, 25% labour, and 20% finishing breakdown.
 */
export const calculateConstructionCost = (buildingType, areaSqFt, customRate = null) => {
  const normType = Object.keys(BUILDING_REQUIREMENTS).find(
    k => k.toLowerCase() === (buildingType || '').toLowerCase()
  ) || 'Individual House';

  const req = BUILDING_REQUIREMENTS[normType] || BUILDING_REQUIREMENTS['Individual House'];
  const rate = customRate !== null && Number(customRate) > 0 ? Number(customRate) : req.rate;
  const area = Math.max(Number(areaSqFt) || 0, 0);
  const totalCost = Math.round(area * rate);

  return {
    buildingType: normType,
    areaSqFt: area,
    ratePerSqFt: rate,
    totalEstimatedCost: totalCost,
    materialCost: Math.round(totalCost * 0.55),
    labourCost: Math.round(totalCost * 0.25),
    finishingCost: Math.round(totalCost * 0.20),
    materialPct: 55,
    labourPct: 25,
    finishingPct: 20
  };
};

/**
 * Accurately calculates the geodesic area in square feet for any set of coordinates.
 */
export const calculatePolygonAreaSqFt = (coords) => {
  return calculateGeodesicArea(coords).sqFt;
};

const gisService = {
  /**
   * Automatically fetch parcel polygon, area, road width, and infrastructure.
   * If Overpass does not have a mapped polygon, dynamically computes a geometric fallback.
   */
  async fetchParcelData(lat, lng) {
    // Look for building or landuse boundary around a 15m radius
    const query = `
      [out:json][timeout:5];
      (
        way["building"](around:15, ${lat}, ${lng});
        relation["building"](around:15, ${lat}, ${lng});
        way["landuse"](around:15, ${lat}, ${lng});
        relation["landuse"](around:15, ${lat}, ${lng});
      );
      out body;
      >;
      out skel qt;
    `;

    try {
      const response = await axios.post(OVERPASS_API, query);
      const elements = response.data?.elements;
      
      if (elements && elements.length > 0) {
        const ways = elements.filter(e => e.type === 'way');
        const nodes = elements.filter(e => e.type === 'node').reduce((acc, n) => {
          acc[n.id] = [n.lon, n.lat];
          return acc;
        }, {});

        if (ways.length > 0) {
          const way = ways.find(w => w.nodes && w.nodes[0] === w.nodes[w.nodes.length - 1]);
          if (way && way.nodes) {
            const coords = way.nodes.map(nid => nodes[nid]).filter(Boolean);
            if (coords.length >= 4) {
              const geojson = {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [coords]
                }
              };
              const sqMeters = area(geojson);
              const areaSqFt = sqMeters * 10.7639104;
              return {
                available: true,
                isEstimated: false,
                source: 'OpenStreetMap / Overpass (Boundary)',
                coords: coords.map(c => ({ lat: c[1], lng: c[0] })),
                areaSqFt: Math.round(areaSqFt * 10) / 10,
                geojson
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('Overpass parcel fetch failed, using geometric calculation:', error);
    }

    // Dynamic geometric fallback calculation based on clicked coordinates
    return generateEstimatedParcel(lat, lng, 15);
  },

  /**
   * Fetch nearby infrastructure (water, elec, road width)
   */
  async fetchInfrastructure(lat, lng) {
    const query = `
      [out:json][timeout:5];
      (
        way["highway"](around:50, ${lat}, ${lng});
        node["power"](around:2000, ${lat}, ${lng});
        way["power"](around:2000, ${lat}, ${lng});
        node["amenity"~"drinking_water|water_point"](around:2000, ${lat}, ${lng});
        way["waterway"](around:2000, ${lat}, ${lng});
      );
      out tags;
    `;
    
    try {
      const response = await axios.post(OVERPASS_API, query);
      const elements = response.data.elements || [];

      let hasWater = false;
      let hasElec = false;
      let roadWidth = null;

      elements.forEach(e => {
        const tags = e.tags || {};
        if (tags.power) hasElec = true;
        if (tags.waterway || tags.amenity === 'drinking_water' || tags.amenity === 'water_point') hasWater = true;
        
        if (tags.highway && roadWidth === null) {
          // Estimate road width in feet based on highway type
          const hw = tags.highway;
          if (hw === 'primary' || hw === 'trunk') roadWidth = 60;
          else if (hw === 'secondary') roadWidth = 40;
          else if (hw === 'tertiary') roadWidth = 30;
          else if (hw === 'residential') roadWidth = 20;
          else roadWidth = 15; // default fallback
        }
      });

      return {
        available: true,
        water: hasWater,
        electricity: hasElec,
        roadWidth: roadWidth
      };
    } catch (error) {
      console.error('Overpass infrastructure fetch error:', error);
      return { available: false };
    }
  },

  /**
   * Fetch soil type from ISRIC SoilGrids
   */
  async fetchSoilType(lat, lng) {
    try {
      const url = `${SOILGRIDS_API}?lon=${lng}&lat=${lat}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      const wrbClass = response.data?.wrb_class_name;
      if (!wrbClass) return { available: false };

      return {
        available: true,
        wrbClass: wrbClass,
        mappedType: mapSoilType(wrbClass)
      };
    } catch (error) {
      console.error('SoilGrids fetch error:', error);
      return { available: false };
    }
  },

  /**
   * Fetch real ESA WorldCover land-cover classification from backend API
   */
  async fetchLandCover(lat, lng) {
    try {
      const response = await api.get('/landcover', { params: { lat, lon: lng } });
      return {
        available: true,
        ...response.data
      };
    } catch (error) {
      console.warn('ESA WorldCover fetch error:', error);
      return { available: false, error: error.message };
    }
  }
};

export default gisService;
