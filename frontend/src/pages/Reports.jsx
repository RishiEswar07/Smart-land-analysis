import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'
import DetailedLandAnalysisModal from '../components/DetailedLandAnalysisModal'
import useFetch from '../hooks/useFetch'
import reportService from '../services/reportService'

export default function Reports() {
  const { data: reports, loading, error, refetch } = useFetch(reportService.getAllReports, [])
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(null)

  const handleDownloadPdf = async (report) => {
    setDownloadingId(`pdf-${report.id}`)
    setDownloadError(null)
    try {
      if (report.analysis_id) {
        await reportService.exportPdf(report.analysis_id, `${report.location_label || 'land'}-analysis-report.pdf`)
      } else {
        await reportService.downloadReport(report.id, `${report.location_label || 'land'}-analysis-report.pdf`)
      }
    } catch (err) {
      setDownloadError(err.message || 'Could not download PDF report.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleExportExcel = async (report) => {
    if (!report.analysis_id) return
    setDownloadingId(`excel-${report.id}`)
    setDownloadError(null)
    try {
      await reportService.exportExcel(report.analysis_id, `${report.location_label || 'land'}-analysis-report.xlsx`)
    } catch (err) {
      setDownloadError(err.message || 'Could not export Excel report.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleExportJson = async (report) => {
    if (!report.analysis_id) return
    setDownloadingId(`json-${report.id}`)
    setDownloadError(null)
    try {
      await reportService.exportJson(report.analysis_id, `${report.location_label || 'land'}-analysis-report.json`)
    } catch (err) {
      setDownloadError(err.message || 'Could not export JSON report.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-12">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="label-eyebrow">Reports</span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-display font-bold text-ink">Generated analysis reports</h1>
          <p className="text-slate text-sm mt-2">
            Every decision support report you've generated with factor breakdowns and multi-format exports (PDF, Excel, JSON).
          </p>
        </div>
        <NavLink to="/land-analysis" className="btn-primary shrink-0">
          New analysis
        </NavLink>
      </div>

      {loading && <Loader label="Loading reports…" />}
      {!loading && error && (
        <ErrorState message="Couldn't load reports. Check that the backend is running." onRetry={refetch} />
      )}

      {!loading && !error && (
        <>
          {downloadError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs mb-4">
              {downloadError}
            </div>
          )}
          <div className="card-base overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-dim uppercase tracking-wide border-b border-line">
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Building Type</th>
                  <th className="px-5 py-3">Suitability</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3 text-right">Multi-Format Exports</th>
                </tr>
              </thead>
              <tbody>
                {(reports ?? []).map((report) => (
                  <tr key={report.id} className="border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-ink font-medium">{report.location_label || '—'}</td>
                    <td className="px-5 py-3.5 text-slate">{report.recommended_building_type ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelectedAnalysisId(report.analysis_id)}
                        className="font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                        title="Click to view detailed factor breakdown"
                      >
                        <span>{report.suitability_score ?? '—'}%</span>
                        <span className="text-[10px]">🔍</span>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-dim text-xs">
                      {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setSelectedAnalysisId(report.analysis_id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded transition-colors"
                          title="Inspect detailed factor breakdown modal"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(report)}
                          disabled={downloadingId === `pdf-${report.id}`}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-xs rounded transition-colors disabled:opacity-50"
                        >
                          {downloadingId === `pdf-${report.id}` ? 'PDF…' : 'PDF'}
                        </button>
                        <button
                          onClick={() => handleExportExcel(report)}
                          disabled={downloadingId === `excel-${report.id}` || !report.analysis_id}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-xs rounded transition-colors disabled:opacity-50"
                        >
                          {downloadingId === `excel-${report.id}` ? 'XLSX…' : 'Excel'}
                        </button>
                        <button
                          onClick={() => handleExportJson(report)}
                          disabled={downloadingId === `json-${report.id}` || !report.analysis_id}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-xs rounded transition-colors disabled:opacity-50"
                        >
                          {downloadingId === `json-${report.id}` ? 'JSON…' : 'JSON'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!reports || reports.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center">
                      <p className="text-slate-dim text-sm mb-3">No reports generated yet.</p>
                      <NavLink to="/land-analysis" className="text-blue text-sm font-semibold hover:underline">
                        Run your first analysis →
                      </NavLink>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Detailed Land Analysis Modal */}
      <DetailedLandAnalysisModal
        isOpen={Boolean(selectedAnalysisId)}
        onClose={() => setSelectedAnalysisId(null)}
        analysisId={selectedAnalysisId}
      />
    </div>
  )
}

