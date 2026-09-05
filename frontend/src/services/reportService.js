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

  /**
   * Directly exports and downloads PDF report from analysis ID.
   */
  exportPdf: async (analysisId, suggestedFilename = 'land-analysis-report.pdf') => {
    const response = await api.get(`/reports/${analysisId}/export/pdf`, { responseType: 'blob' })
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

  /**
   * Directly exports and downloads multi-sheet Excel report (.xlsx) from analysis ID.
   */
  exportExcel: async (analysisId, suggestedFilename = 'land-analysis-report.xlsx') => {
    const response = await api.get(`/reports/${analysisId}/export/excel`, { responseType: 'blob' })
    const disposition = response.headers['content-disposition']
    const match = disposition && disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : suggestedFilename

    const blobUrl = window.URL.createObjectURL(
      new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    )
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  },

  /**
   * Fetches the 15-section JSON report data.
   */
  getJsonReport: (analysisId) => api.get(`/reports/${analysisId}/export/json`).then((res) => res.data),

  /**
   * Exports JSON report as a downloadable .json file.
   */
  exportJson: async (analysisId, suggestedFilename = 'land-analysis-report.json') => {
    const res = await api.get(`/reports/${analysisId}/export/json`)
    const blobUrl = window.URL.createObjectURL(
      new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = suggestedFilename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  },
}

export default reportService

