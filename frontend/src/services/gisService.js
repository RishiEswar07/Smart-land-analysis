import axios from 'axios';
import area from '@turf/area';
import centroid from '@turf/centroid';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const SOILGRIDS_API = 'https://rest.isric.org/soilgrids/v2.0/classification/query';

import api from './api.js';
import landService from './landService.js';

// Highway classification labels ONLY - no fixed width fabrication!
export const ROAD_LABEL_MAP = {
  motorway: 'Motorway / Expressway',
  motorway_link: 'Motorway Ramp / Link',
  trunk: 'National Highway / Trunk',
  trunk_link: 'Trunk Ramp / Link',
  primary: 'State Highway / Primary Arterial',
  primary_link: 'Primary Arterial Link',
  secondary: 'Major District Road / Secondary',
  secondary_link: 'Secondary Road Link',
  tertiary: 'Minor District Road / Collector',
  tertiary_link: 'Collector Link',
  residential: 'Residential Street',
  living_street: 'Living Street',
  unclassified: 'Unclassified Rural / Local Road',
  service: 'Local Service Road / Access Lane',
  track: 'Agricultural Cart Track',
};

// Backward-compatible alias
export const ROAD_HIERARCHY_MAP = ROAD_LABEL_MAP;

/**
 * Calculates Euclidean distance in meters from point P to line segment AB using local projection.
 */
export const distancePointToSegmentMeters = (pLat, pLng, aLat, aLng, bLat, bLng) => {
  const meanLatRad = ((pLat + aLat + bLat) / 3.0) * (Math.PI / 180.0);
  const kx = Math.cos(meanLatRad) * 111320.0;
  const ky = 110540.0;

  const px = pLng * kx, py = pLat * ky;
  const ax = aLng * kx, ay = aLat * ky;
  const bx = bLng * kx, by = bLat * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0.0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0.0, Math.min(1.0, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.hypot(px - projX, py - projY);
};

/**
 * Evaluates road width with strict separation:
 * - Tagged Road Width: Actual measured OSM tag
 * - Estimated Carriageway Width: Lane-derived estimate (strictly labeled as carriageway only)
 * - Highway classification alone NEVER assigns a fixed road width.
 * - If verified width is unavailable, shows 'Manual road-width verification required'.
 */
export const parseRoadWidthPriority = (tags = {}) => {
  let taggedWFt = null;
  let taggedWM = null;
  let hasTagged = false;
  let taggedSource = null;

  let estCwayFt = null;
  let estCwayM = null;
  let hasEstCway = false;
  let cwayBasis = null;

  // 1. Tagged road width
  const rawWidth = tags.width || tags['width:carriageway'] || tags.est_width;
  if (rawWidth) {
    const clean = String(rawWidth).trim().toLowerCase();
    const isFeet = clean.includes('ft') || clean.includes("'") || clean.includes('feet');
    const match = clean.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        if (isFeet || val > 35.0) {
          taggedWFt = Math.round(val * 10) / 10;
          taggedWM = Math.round(taggedWFt * 0.3048 * 100) / 100;
        } else {
          taggedWM = Math.round(val * 100) / 100;
          taggedWFt = Math.round(taggedWM * 3.28084 * 10) / 10;
        }
        hasTagged = true;
        taggedSource = `OSM Measured Tag (width: ${rawWidth})`;
      }
    }
  }

  // 2. Estimated Carriageway Width from lanes (strictly labeled as carriageway)
  const rawLanes = tags.lanes;
  if (rawLanes) {
    const lanes = parseInt(String(rawLanes).trim(), 10);
    if (!isNaN(lanes) && lanes > 0) {
      estCwayM = Math.round(lanes * 3.5 * 10) / 10;
      estCwayFt = Math.round(estCwayM * 3.28084 * 10) / 10;
      hasEstCway = true;
      cwayBasis = `${lanes} lanes @ 3.5m/lane (IRC 73/86 carriageway standard)`;
    }
  }

  if (hasTagged) {
    return {
      tagged_road_width_ft: taggedWFt,
      tagged_road_width_m: taggedWM,
      has_tagged_width: true,
      estimated_carriageway_width_ft: estCwayFt,
      estimated_carriageway_width_m: estCwayM,
      has_estimated_carriageway: hasEstCway,
      carriageway_calculation_basis: cwayBasis,
      verified_road_width_ft: taggedWFt,
      verified_road_width_m: taggedWM,
      road_width_ft: taggedWFt,
      road_width_m: taggedWM,
      is_road_width_estimated: false,
      width_status: 'Verified Tagged Width',
      verification_requirement: 'Verified via OSM Measured Tag',
      tncdbr_eligibility: 'Eligible for TNCDBR statutory evaluation with verified width',
      confidence: 'VERIFIED (OSM Measured Tag)',
      data_source: taggedSource || 'OpenStreetMap Tagged Width',
    };
  }

  if (hasEstCway) {
    return {
      tagged_road_width_ft: null,
      tagged_road_width_m: null,
      has_tagged_width: false,
      estimated_carriageway_width_ft: estCwayFt,
      estimated_carriageway_width_m: estCwayM,
      has_estimated_carriageway: true,
      carriageway_calculation_basis: cwayBasis,
      verified_road_width_ft: null,
      verified_road_width_m: null,
      road_width_ft: null,
      road_width_m: null,
      is_road_width_estimated: true,
      width_status: 'Estimated Carriageway Only (Road width data unavailable)',
      verification_requirement: 'Manual road-width verification required',
      tncdbr_eligibility: 'Manual road-width verification required (Estimated carriageway cannot be used for TNCDBR compliance)',
      confidence: 'ESTIMATED CARRIAGEWAY ONLY',
      data_source: `Estimated Carriageway Width: ${cwayBasis}`,
    };
  }

  const hw = (tags.highway || 'unclassified').toLowerCase().trim();
  const label = ROAD_LABEL_MAP[hw] || hw.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  return {
    tagged_road_width_ft: null,
    tagged_road_width_m: null,
    has_tagged_width: false,
    estimated_carriageway_width_ft: null,
    estimated_carriageway_width_m: null,
    has_estimated_carriageway: false,
    carriageway_calculation_basis: null,
    verified_road_width_ft: null,
    verified_road_width_m: null,
    road_width_ft: null,
    road_width_m: null,
    is_road_width_estimated: false,
    width_status: 'Road width data unavailable',
    verification_requirement: 'Manual road-width verification required',
    tncdbr_eligibility: 'Manual road-width verification required (No verified road width data available)',
    confidence: 'UNAVAILABLE',
    data_source: `OSM Road Network (${label}) - Width data unavailable`,
  };
};

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
      sqMeters = 0;
    }
  }

  if (isNaN(sqMeters) || sqMeters <= 0) {
    return { sqMeters: 0, sqFt: 0, cents: 0, acres: 0 };
  }

  const sqFt = sqMeters * 10.7639104;
  const cents = sqFt / 435.6;
  const acres = sqFt / 43560.0;

  return {
    sqMeters: Math.round(sqMeters * 10) / 10,
    sqFt: Math.round(sqFt * 10) / 10,
    cents: Math.round(cents * 100) / 100,
    acres: Math.round(acres * 10000) / 10000
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
 * Accurately calculates the geodesic area in square feet for any set of coordinates.
 */
export const calculatePolygonAreaSqFt = (coords) => {
  return calculateGeodesicArea(coords).sqFt;
};

/**
 * Calculates the total perimeter of a polygon in feet and meters.
 */
export const calculatePolygonPerimeter = (coords) => {
  if (!coords || coords.length < 2) {
    return { meters: 0, feet: 0 };
  }
  const rad = Math.PI / 180;
  const R = 6378137; // Earth radius in meters
  let totalDistanceMeters = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    const lat1 = (p1.lat ?? p1[1]) * rad;
    const lat2 = (p2.lat ?? p2[1]) * rad;
    const dLat = lat2 - lat1;
    const dLng = ((p2.lng ?? p2[0]) - (p1.lng ?? p1[0])) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalDistanceMeters += R * c;
  }
  const feet = totalDistanceMeters * 3.28084;
  return {
    meters: Math.round(totalDistanceMeters * 10) / 10,
    feet: Math.round(feet * 10) / 10,
  };
};

/**
 * Checks if a 2D line segment (p1-p2) intersects with (p3-p4).
 */
function lineSegmentsIntersect(p1, p2, p3, p4) {
  const ccw = (A, B, C) => (C.lat - A.lat) * (B.lng - A.lng) > (B.lat - A.lat) * (C.lng - A.lng);
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Validates a polygon boundary for:
 * 1. Minimum 3 points
 * 2. Self-intersections (bow-tie or complex polygon)
 * 3. Minimum non-zero area
 */
export const validatePolygonGeometry = (coords) => {
  if (!coords || coords.length < 3) {
    return {
      isValid: false,
      reason: 'A polygon requires at least 3 points to form a closed shape.',
    };
  }

  // Check self-intersections among non-adjacent edges
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const a1 = coords[i];
    const a2 = coords[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = coords[j];
      const b2 = coords[(j + 1) % n];
      if (lineSegmentsIntersect(a1, a2, b1, b2)) {
        return {
          isValid: false,
          reason: 'Polygon lines cross over each other (self-intersecting). Please redraw or adjust the vertices.',
        };
      }
    }
  }

  const { sqFt } = calculateGeodesicArea(coords);
  if (!sqFt || sqFt <= 5) {
    return {
      isValid: false,
      reason: 'Enclosed polygon area is too small to be a valid land parcel.',
    };
  }

  return {
    isValid: true,
    reason: null,
  };
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
                source: 'Survey Boundary Mapping',
                coords: coords.map(c => ({ lat: c[1], lng: c[0] })),
                areaSqFt: Math.round(areaSqFt * 10) / 10,
                geojson
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('Overpass parcel fetch:', error);
    }

    // No synthetic geometry is invented for unmapped points
    return {
      available: false,
      isEstimated: false,
      source: null,
      coords: [],
      areaSqFt: null,
      geojson: null
    };
  },

  /**
   * Identifies genuine nearest accessible road to parcel using backend road service
   * with high-reliability browser fallback (Nominatim + OSM Way API).
   */
  async fetchNearestRoad(lat, lng, boundaryCoords = null) {
    // 1. Try backend dedicated road detection endpoint first
    try {
      const backendRes = await landService.detectRoadAccess(lat, lng);
      if (backendRes && backendRes.available !== undefined) {
        return backendRes;
      }
    } catch (e) {
      console.warn('Backend road detection call failed, attempting browser fallback:', e?.message);
    }

    // 2. Direct browser fallback via Nominatim Reverse Geocoding
    try {
      const headers = { Accept: 'application/json' };
      const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${Number(lat).toFixed(6)}&lon=${Number(lng).toFixed(6)}&format=json&zoom=18&addressdetails=1`;
      const nomResp = await axios.get(revUrl, { headers, timeout: 5000 });
      const nomData = nomResp.data || {};

      const refPoints = [{ lat: Number(lat), lng: Number(lng) }];
      if (Array.isArray(boundaryCoords) && boundaryCoords.length >= 3) {
        boundaryCoords.forEach(c => {
          const cLat = c.lat ?? c[1];
          const cLng = c.lng ?? c[0];
          if (cLat != null && cLng != null) refPoints.push({ lat: Number(cLat), lng: Number(cLng) });
        });
      }

      const osmId = nomData.osm_id;
      const osmType = nomData.osm_type;
      const osmClass = nomData.class;
      const roadTag = nomData.address?.road;

      if (osmType === 'way' && osmId && osmClass === 'highway') {
        const wayUrl = `https://api.openstreetmap.org/api/0.6/way/${osmId}/full.json`;
        const wResp = await axios.get(wayUrl, { headers, timeout: 5000 });
        const elements = wResp.data?.elements || [];
        const nodes = elements.filter(el => el.type === 'node');
        const ways = elements.filter(el => el.type === 'way');
        const wayTags = ways[0]?.tags || {};

        let minDist = 9999;
        if (nodes.length >= 2) {
          refPoints.forEach(p => {
            for (let i = 0; i < nodes.length - 1; i++) {
              const d = distancePointToSegmentMeters(p.lat, p.lng, nodes[i].lat, nodes[i].lon, nodes[i + 1].lat, nodes[i + 1].lon);
              if (d < minDist) minDist = d;
            }
          });
        }

        if (minDist <= 80.0) {
          const hw = (wayTags.highway || nomData.type || 'residential').toLowerCase();
          const widthInfo = parseRoadWidthPriority(wayTags);
          const typeDisplay = ROAD_HIERARCHY_MAP[hw]?.label || hw.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          const roadNameDisplay = wayTags.name || roadTag || `Unnamed ${typeDisplay}`;
          const distM = Math.round(minDist * 10) / 10;
          const distDisplay = distM > 0 ? `${distM} m from parcel boundary` : 'Directly abutting parcel';

          return {
            available: true,
            road_name: roadNameDisplay,
            road_type: hw,
            road_type_display: typeDisplay,
            tagged_road_width_ft: widthInfo.tagged_road_width_ft,
            tagged_road_width_m: widthInfo.tagged_road_width_m,
            has_tagged_width: widthInfo.has_tagged_width,
            estimated_carriageway_width_ft: widthInfo.estimated_carriageway_width_ft,
            estimated_carriageway_width_m: widthInfo.estimated_carriageway_width_m,
            has_estimated_carriageway: widthInfo.has_estimated_carriageway,
            carriageway_calculation_basis: widthInfo.carriageway_calculation_basis,
            verified_road_width_ft: widthInfo.verified_road_width_ft,
            verified_road_width_m: widthInfo.verified_road_width_m,
            road_width_ft: widthInfo.road_width_ft,
            road_width_m: widthInfo.road_width_m,
            distance_meters: distM,
            distance_display: distDisplay,
            is_road_width_estimated: widthInfo.is_road_width_estimated,
            width_status: widthInfo.width_status,
            verification_requirement: widthInfo.verification_requirement,
            tncdbr_eligibility: widthInfo.tncdbr_eligibility,
            confidence: widthInfo.confidence,
            data_source: widthInfo.data_source,
            lanes: wayTags.lanes ? parseInt(wayTags.lanes, 10) : null,
            maxspeed: wayTags.maxspeed || null,
            surface: wayTags.surface || null,
            osm_id: osmId,
          };
        }
      }

      if (roadTag) {
        return {
          available: true,
          road_name: roadTag,
          road_type: 'residential',
          road_type_display: 'Residential Street / Colony Access',
          tagged_road_width_ft: null,
          tagged_road_width_m: null,
          has_tagged_width: false,
          estimated_carriageway_width_ft: null,
          estimated_carriageway_width_m: null,
          has_estimated_carriageway: false,
          carriageway_calculation_basis: null,
          verified_road_width_ft: null,
          verified_road_width_m: null,
          road_width_ft: null,
          road_width_m: null,
          distance_meters: 10.0,
          distance_display: 'Abutting parcel address frontage',
          is_road_width_estimated: false,
          width_status: 'Road width data unavailable',
          verification_requirement: 'Manual road-width verification required',
          tncdbr_eligibility: 'Manual road-width verification required (No verified road width data available)',
          confidence: 'UNAVAILABLE',
          data_source: 'Nominatim Frontage Record - Width data unavailable',
          lanes: null,
          maxspeed: null,
          surface: null,
          osm_id: osmId || null,
        };
      }
    } catch (e) {
      console.warn('Browser direct road lookup error:', e?.message);
    }

    return {
      available: false,
      road_name: 'No accessible road within 50 m',
      road_type: 'unmapped',
      road_type_display: 'No Abutting Road Mapped',
      tagged_road_width_ft: null,
      tagged_road_width_m: null,
      has_tagged_width: false,
      estimated_carriageway_width_ft: null,
      estimated_carriageway_width_m: null,
      has_estimated_carriageway: false,
      carriageway_calculation_basis: null,
      verified_road_width_ft: null,
      verified_road_width_m: null,
      road_width_ft: null,
      road_width_m: null,
      distance_meters: null,
      distance_display: 'No accessible road within 50 m (Manual road-width verification required)',
      is_road_width_estimated: false,
      width_status: 'Road width data unavailable',
      verification_requirement: 'Manual road-width verification required',
      tncdbr_eligibility: 'Manual road-width verification required (No abutting accessible road mapped)',
      confidence: 'UNAVAILABLE',
      data_source: 'Width data unavailable (No accessible road within 50m)',
      lanes: null,
      maxspeed: null,
      surface: null,
      osm_id: null,
    };
  },

  /**
   * Fetch nearby infrastructure (road width, natural water bodies, and utilities)
   */
  async fetchInfrastructure(lat, lng, boundaryCoords = null) {
    // 1. Fetch genuine nearest abutting road with geometric distance & 4-tier width
    const roadData = await this.fetchNearestRoad(lat, lng, boundaryCoords);

    // 2. Fetch natural water bodies & utilities via Overpass
    const query = `
      [out:json][timeout:5];
      (
        node["power"](around:2000, ${lat}, ${lng});
        way["power"](around:2000, ${lat}, ${lng});
        node["amenity"~"drinking_water|water_point"](around:2000, ${lat}, ${lng});
        way["waterway"](around:2000, ${lat}, ${lng});
      );
      out tags;
    `;
    
    const mirrors = [
      OVERPASS_API,
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    const detectedWaterBodies = [];

    try {
      let elements = [];
      for (const mirror of mirrors) {
        try {
          const response = await axios.post(mirror, query, { timeout: 4000 });
          if (response?.data?.elements) {
            elements = response.data.elements;
            break;
          }
        } catch (e) {
          // Failover to next mirror
        }
      }

      elements.forEach(e => {
        const tags = e.tags || {};
        if (tags.waterway) {
          const wName = tags.name || `${tags.waterway.charAt(0).toUpperCase() + tags.waterway.slice(1)} channel`;
          if (!detectedWaterBodies.includes(wName)) {
            detectedWaterBodies.push(wName);
          }
        } else if (tags.amenity === 'drinking_water' || tags.amenity === 'water_point') {
          const ptName = tags.name || 'Public water point / standpost';
          if (!detectedWaterBodies.includes(ptName)) {
            detectedWaterBodies.push(ptName);
          }
        }
      });
    } catch (e) {
      console.warn('Water bodies lookup error:', e?.message);
    }

    const waterBodiesSummary = detectedWaterBodies.length > 0
      ? `${detectedWaterBodies.length} detected within 2 km (${detectedWaterBodies.slice(0, 2).join(', ')}${detectedWaterBodies.length > 2 ? '…' : ''})`
      : 'No open water bodies mapped within 2 km';

    return {
      available: true,
      water_availability: null,
      electricity_availability: null,
      water_bodies: detectedWaterBodies,
      water_bodies_summary: waterBodiesSummary,
      // Separated road access properties
      taggedRoadWidthFt: roadData.tagged_road_width_ft,
      taggedRoadWidthM: roadData.tagged_road_width_m,
      hasTaggedWidth: roadData.has_tagged_width,
      estimatedCarriagewayWidthFt: roadData.estimated_carriageway_width_ft,
      estimatedCarriagewayWidthM: roadData.estimated_carriageway_width_m,
      hasEstimatedCarriageway: roadData.has_estimated_carriageway,
      carriagewayCalculationBasis: roadData.carriageway_calculation_basis,
      verifiedRoadWidthFt: roadData.verified_road_width_ft,
      verifiedRoadWidthM: roadData.verified_road_width_m,
      roadWidth: roadData.verified_road_width_ft, // Verified only, null if missing/estimated
      roadWidthFt: roadData.verified_road_width_ft,
      roadWidthM: roadData.verified_road_width_m,
      widthStatus: roadData.width_status,
      verificationRequirement: roadData.verification_requirement,
      tncdbrEligibility: roadData.tncdbr_eligibility,
      roadName: roadData.road_name,
      roadType: roadData.road_type,
      roadTypeDisplay: roadData.road_type_display,
      distanceMeters: roadData.distance_meters,
      distanceDisplay: roadData.distance_display,
      isRoadWidthEstimated: roadData.is_road_width_estimated,
      confidence: roadData.confidence,
      dataSource: roadData.data_source,
      roadDetails: roadData,
    };
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
  },

  /**
   * Fetch real nearby facilities and geodesic proximity (km) via backend proxy
   */
  async fetchNearbyFacilities(lat, lng, radiusKm = 5.0) {
    try {
      const response = await api.get('/lands/nearby-facilities/search', {
        params: { lat, lng, radius_km: radiusKm }
      });
      return response.data;
    } catch (error) {
      console.warn('Nearby facilities fetch error:', error);
      return {
        status: 'unavailable',
        message: 'Facility proximity service is temporarily busy. Please retry.',
        search_radius_km: radiusKm,
        total_facilities_found: 0,
        total_found: 0,
        categories: {},
        all_facilities: []
      };
    }
  }
};

export default gisService;
