import api from './api'

/**
 * PDF Report generation/download API calls.
 * Matches backend routes: /api/v1/reports
 *
 * IMPORTANT: /reports/{id}/download is a protected endpoint (requires
 * the JWT Bearer header). A plain <a href> or window.open() can't
 * attach that header, so downloadReport() below fetches the PDF as an
 * authenticated blob (via the same axios instance that already
 * attaches the token) and triggers a save via a temporary object URL —
 * this is the correct pattern for downloading protected files.
 */
const reportService = {
  generateReport: (analysisId) =>
    api.post(`/reports/${analysisId}/generate`).then((res) => res.data),

  getAllReports: () => api.get('/reports').then((res) => res.data),

  /**
   * Downloads a report PDF as an authenticated request and saves it to
   * the user's device. Returns a promise that resolves once the save
   * has been triggered.
   */
  downloadReport: async (reportId, suggestedFilename = 'land-analysis-report.pdf') => {
    const response = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' })

    // Prefer the server's suggested filename (from Content-Disposition)
    // if present, falling back to the caller's default.
    const disposition = response.headers['content-disposition']
    const match = disposition && disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : suggestedFilename

    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  },
}

export default reportService
