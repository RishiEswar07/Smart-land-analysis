import api from './api'

/**
 * Land Management API calls.
 * Matches backend routes: /api/v1/lands
 */
const landService = {
  createLand: (payload) => api.post('/lands', payload).then((res) => res.data),

  getLands: (params = {}) => api.get('/lands', { params }).then((res) => res.data),

  getLandById: (id) => api.get(`/lands/${id}`).then((res) => res.data),

  updateLand: (id, payload) => api.put(`/lands/${id}`, payload).then((res) => res.data),

  deleteLand: (id) => api.delete(`/lands/${id}`).then((res) => res.data),

  getNearbyFacilities: (id, radiusKm = 5.0) =>
    api.get(`/lands/${id}/facilities`, { params: { radius_km: radiusKm } }).then((res) => res.data),

  searchNearbyFacilities: (lat, lng, radiusKm = 5.0) =>
    api.get('/lands/nearby-facilities/search', { params: { lat, lng, radius_km: radiusKm } }).then((res) => res.data),

  getFloodRisk: (id) => api.get(`/lands/${id}/flood-risk`).then((res) => res.data),
  getPlanningRules: (id, buildingType = null) =>
    api.get(`/lands/${id}/planning-rules`, { params: buildingType ? { building_type: buildingType } : {} }).then((res) => res.data),
  calculatePlanningRulesPreview: (areaSqFt, roadWidthFt, buildingType = 'Individual House') =>
    api.get('/lands/planning-rules/calculate', { params: { area_sqft: areaSqFt, road_width_ft: roadWidthFt, building_type: buildingType } }).then((res) => res.data),
  compareParcels: (parcelIds, buildingType = 'Individual House') =>
    api.post('/lands/compare', { parcel_ids: parcelIds, building_type: buildingType }).then((res) => res.data),
}

export default landService
