import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'

/**
 * Circular suitability-score gauge (0-100), color-coded by band.
 * Used on Land Analysis result and Dashboard.
 */
function bandColor(score) {
  if (score >= 75) return '#16A34A' // green — very good
  if (score >= 50) return '#2563EB' // blue — good
  if (score >= 30) return '#D97706' // amber — caution
  return '#DC2626' // red — poor
}

function bandLabel(score) {
  if (score >= 75) return 'Very Good'
  if (score >= 50) return 'Good'
  if (score >= 30) return 'Moderate'
  return 'Poor'
}

export default function ScoreGauge({ score = 0, size = 180 }) {
  const color = bandColor(score)
  const data = [{ name: 'score', value: score, fill: color }]

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <RadialBarChart
        width={size}
        height={size}
        cx="50%"
        cy="50%"
        innerRadius="72%"
        outerRadius="100%"
        barSize={14}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: '#EEF2F7' }} dataKey="value" cornerRadius={20} />
      </RadialBarChart>
      <div className="-mt-[104px] flex flex-col items-center pointer-events-none">
        <span className="text-3xl font-display font-extrabold text-ink">{Math.round(score)}%</span>
        <span className="text-xs font-semibold mt-1" style={{ color }}>
          {bandLabel(score)}
        </span>
      </div>
      <div className="mt-2" />
    </div>
  )
}
