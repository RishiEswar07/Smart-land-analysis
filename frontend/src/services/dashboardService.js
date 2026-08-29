import api from './api'

/**
 * Dashboard aggregate API calls.
 * Matches backend routes: /api/v1/dashboard
 */
const dashboardService = {
  getSummary: () => api.get('/dashboard/summary').then((res) => res.data),

  getBuildingDistribution: () =>
    api.get('/dashboard/building-distribution').then((res) => res.data),

  getRecentAnalyses: (limit = 5) =>
    api.get('/dashboard/recent-analyses', { params: { limit } }).then((res) => res.data),
}

export default dashboardService
