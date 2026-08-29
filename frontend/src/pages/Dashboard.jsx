import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import StatCard from '../components/StatCard'
import ScoreGauge from '../components/ScoreGauge'
import RiskCard from '../components/RiskCard'
import FacilityCard from '../components/FacilityCard'
import Loader from '../components/Loader'
import ErrorState from '../components/ErrorState'
import useFetch from '../hooks/useFetch'
import dashboardService from '../services/dashboardService'
import landService from '../services/landService'

// Maps a risk-level label to the correct badge color — used so the
// recent-analyses table never shows a fixed color regardless of the
// actual value (that was part of the "always looks the same" bug).
function riskBadgeClass(level) {
  if (level === 'Low') return 'bg-green-light text-green-deep'
  if (level === 'Moderate' || level === 'Medium') return 'bg-amber-light text-amber'
  if (level === 'High') return 'bg-danger-light text-danger'
  return 'bg-mist text-slate-dim'
}

export default function Dashboard() {
  const { data: summary, loading: loadingSummary, error: errorSummary, refetch: refetchSummary } =
    useFetch(dashboardService.getSummary, [])

  const { data: distribution, loading: loadingDist } = useFetch(dashboardService.getBuildingDistribution, [])

  const { data: recent, loading: loadingRecent } = useFetch(() => dashboardService.getRecentAnalyses(8), [])

  // Facilities/flood-risk for the most recently analysed land (if any)
  const latestLandId = recent?.[0]?.land_id
  const { data: facilities } = useFetch(
    () => (latestLandId ? landService.getNearbyFacilities(latestLandId) : Promise.resolve(null)),
    [latestLandId],
    Boolean(latestLandId)
  )
  const { data: floodRisk } = useFetch(
    () => (latestLandId ? landService.getFloodRisk(latestLandId) : Promise.resolve(null)),
    [latestLandId],
    Boolean(latestLandId)
  )

  if (loadingSummary) return <Loader label="Loading dashboard…" />
  if (errorSummary)
    return (
      <ErrorState
        message="Couldn't load dashboard data. Make sure the FastAPI backend is running at the configured API URL."
        onRetry={refetchSummary}
      />
    )

  const latest = recent?.[0]

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-12">
      <div className="mb-8">
        <span className="label-eyebrow">Dashboard</span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-display font-bold text-ink">Your analysis overview</h1>
        <p className="text-slate text-sm mt-2">A snapshot of every land you've analyzed so far.</p>
      </div>

      {/* ---------------- STAT ROW ---------------- */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard icon="📍" label="Lands analysed" value={summary?.total_lands ?? 0} tone="blue" />
        <StatCard icon="📄" label="Reports generated" value={summary?.total_reports ?? 0} tone="green" />
        <StatCard
          icon="📈"
          label="Avg. suitability score"
          value={`${summary?.average_suitability_score ?? 0}%`}
          tone="blue"
        />
        <StatCard icon="🏗️" label="Most recommended type" value={summary?.top_building_type ?? '—'} tone="green" />
      </div>

      {/* ---------------- LATEST ANALYSIS ---------------- */}
      {latest && (
        <div className="mb-10">
          <h2 className="font-display font-semibold text-ink text-lg mb-4">Latest analysis</h2>
          <div className="grid lg:grid-cols-[260px_1fr] gap-5">
            <div className="card-base p-6 flex flex-col items-center text-center">
              <ScoreGauge score={latest.suitability_score ?? 0} size={150} />
              <p className="text-xs font-semibold text-ink mt-2">{latest.recommended_building_type}</p>
              <p className="text-[11px] text-slate-dim">{latest.location_label || 'Selected plot'}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <RiskCard
                icon="🌊"
                title="Flood Risk"
                level={floodRisk?.risk_level ?? latest.flood_risk ?? 'Unknown'}
                description={floodRisk?.notes || 'Based on soil drainage class and road width.'}
              />
              <RiskCard
                icon="🍃"
                title="Environmental Risk"
                level={latest.environmental_risk ?? 'Unknown'}
                description="Based on soil type — excavation and disturbance sensitivity."
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- NEARBY FACILITIES ---------------- */}
      <div className="mb-10">
        <h2 className="font-display font-semibold text-ink text-lg mb-4">Nearby facilities</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FacilityCard icon="🏫" title="Nearby Schools" items={facilities?.schools ?? []} />
          <FacilityCard icon="🏥" title="Nearby Hospitals" items={facilities?.hospitals ?? []} />
          <FacilityCard icon="🛣️" title="Nearby Roads" items={facilities?.roads ?? []} />
        </div>
      </div>

      {/* ---------------- CHARTS ---------------- */}
      <div className="grid lg:grid-cols-2 gap-5 mb-10">
        <div className="card-base p-6">
          <h3 className="font-display font-semibold text-ink text-sm mb-1">Building type distribution</h3>
          <p className="text-xs text-slate-dim mb-4">How often each type is recommended across all analyses</p>
          {loadingDist ? (
            <Loader label="Loading chart…" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distribution ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="building_type" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F5F8FC' }} contentStyle={{ borderRadius: 10, borderColor: '#E2E8F0', fontSize: 12 }} />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-base p-6">
          <h3 className="font-display font-semibold text-ink text-sm mb-1">Suitability score trend</h3>
          <p className="text-xs text-slate-dim mb-4">Score of your most recent analyses, in order</p>
          {loadingRecent ? (
            <Loader label="Loading chart…" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={[...(recent ?? [])].reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="location_label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#E2E8F0', fontSize: 12 }} />
                <Line type="monotone" dataKey="suitability_score" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ---------------- RECENT ANALYSES TABLE ---------------- */}
      <div>
        <h2 className="font-display font-semibold text-ink text-lg mb-4">Recent analyses</h2>
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-dim uppercase tracking-wide border-b border-line">
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Building Type</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Flood Risk</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-ink">{row.location_label || '—'}</td>
                  <td className="px-5 py-3.5 text-slate">{row.recommended_building_type}</td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{row.suitability_score}%</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${riskBadgeClass(row.flood_risk)}`}>
                      {row.flood_risk ?? 'Unknown'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-dim text-xs">
                    {row.analyzed_at ? new Date(row.analyzed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
              {(!recent || recent.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-dim text-sm">
                    No analyses yet — run your first one from the Land Analysis page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
