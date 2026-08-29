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

  getNearbyFacilities: (id) => api.get(`/lands/${id}/facilities`).then((res) => res.data),

  getFloodRisk: (id) => api.get(`/lands/${id}/flood-risk`).then((res) => res.data),
}

export default landService
