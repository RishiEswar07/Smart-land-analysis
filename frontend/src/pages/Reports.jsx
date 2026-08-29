import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'
import useFetch from '../hooks/useFetch'
import reportService from '../services/reportService'

export default function Reports() {
  const { data: reports, loading, error, refetch } = useFetch(reportService.getAllReports, [])
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)

  const handleDownload = async (report) => {
    setDownloadingId(report.id)
    setDownloadError(null)
    try {
      await reportService.downloadReport(report.id, `${report.location_label || 'land'}-analysis-report.pdf`)
    } catch (err) {
      setDownloadError(err.message || 'Could not download this report.')
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
          <p className="text-slate text-sm mt-2">Every PDF you've generated from a completed land analysis.</p>
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
          {downloadError && <p className="text-xs text-danger mb-3">{downloadError}</p>}
          <div className="card-base overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-dim uppercase tracking-wide border-b border-line">
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Building Type</th>
                  <th className="px-5 py-3">Suitability</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(reports ?? []).map((report) => (
                  <tr key={report.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 text-ink">{report.location_label || '—'}</td>
                    <td className="px-5 py-3.5 text-slate">{report.recommended_building_type ?? '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-ink">{report.suitability_score ?? '—'}%</td>
                    <td className="px-5 py-3.5 text-slate-dim text-xs">
                      {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDownload(report)}
                        disabled={downloadingId === report.id}
                        className="text-blue font-semibold text-xs hover:underline disabled:opacity-50"
                      >
                        {downloadingId === report.id ? 'Downloading…' : 'Download PDF'}
                      </button>
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
    </div>
  )
}
