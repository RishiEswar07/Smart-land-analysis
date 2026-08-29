import axios from 'axios';
import area from '@turf/area';
import centroid from '@turf/centroid';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const SOILGRIDS_API = 'https://rest.isric.org/soilgrids/v2.0/classification/query';

// Mapping WRB Soil classes to our project types
const mapSoilType = (wrbClassName) => {
  const name = (wrbClassName || '').toLowerCase();
  if (name.includes('vertisol')) return 'Black Cotton';
  if (name.includes('arenosol') || name.includes('podzol')) return 'Sandy';
  if (name.includes('acrisol') || name.includes('ferralsol') || name.includes('nitisol') || name.includes('lixisol')) return 'Red Soil';
  if (name.includes('leptosol') || name.includes('regosol')) return 'Rocky';
  if (name.includes('cambisol') || name.includes('luvisol') || name.includes('phaeozem') || name.includes('kastanozem')) return 'Loamy';
  if (name.includes('gleysol') || name.includes('fluvisol') || name.includes('stagnosol') || name.includes('planosol')) return 'Clayey';
  return 'Loamy'; // Default generic
};

const gisService = {
  /**
   * Automatically fetch parcel polygon, area, road width, and infrastructure
   */
  async fetchParcelData(lat, lng) {
    // We look for a building or landuse boundary around a tight 15m radius
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
      const elements = response.data.elements;
      
      if (!elements || elements.length === 0) {
        return { available: false, error: 'No mapped parcel/building boundary found here.' };
      }

      // Reconstruct geometry
      const ways = elements.filter(e => e.type === 'way');
      const nodes = elements.filter(e => e.type === 'node').reduce((acc, n) => {
        acc[n.id] = [n.lon, n.lat];
        return acc;
      }, {});

      if (ways.length === 0) return { available: false, error: 'No boundary available' };

      // Take the first closed way
      const way = ways.find(w => w.nodes[0] === w.nodes[w.nodes.length - 1]);
      if (!way) return { available: false, error: 'No closed boundary available' };

      const coords = way.nodes.map(nid => nodes[nid]).filter(c => !!c);
      
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
        coords: coords.map(c => ({ lat: c[1], lng: c[0] })),
        areaSqFt,
        geojson
      };
    } catch (error) {
      console.error('Overpass parcel fetch error:', error);
      return { available: false, error: 'API failure' };
    }
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
  }
};

export default gisService;
