import api from './api'

/**
 * AI Suitability Analysis API calls.
 * Matches backend routes: /api/v1/analysis
 */
const analysisService = {
  /** Runs the ML pipeline for a given land and returns the result. */
  predict: (landId) => api.post('/analysis/predict', { land_id: landId }).then((res) => res.data),

  getAnalysisById: (id) => api.get(`/analysis/${id}`).then((res) => res.data),

  getAnalysesForLand: (landId) => api.get(`/lands/${landId}/analyses`).then((res) => res.data),
}

export default analysisService
