/**
 * Nearby-facility summary card (schools, hospitals, roads, bus stands).
 * `items` is an array of { name, distanceKm } from the facilities API.
 */
export default function FacilityCard({ icon, title, items = [], emptyLabel = 'No data available' }) {
  return (
    <div className="card-base p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-blue-mist text-blue-deep flex items-center justify-center text-base">
          {icon}
        </div>
        <h4 className="text-sm font-display font-semibold text-ink">{title}</h4>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-dim">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between text-sm">
              <span className="text-ink truncate pr-3">{item.name}</span>
              <span className="data-mono text-slate shrink-0">{item.distanceKm} km</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
