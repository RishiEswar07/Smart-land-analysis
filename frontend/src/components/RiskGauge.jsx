import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'

/**
 * Circular RISK gauge (0-100) — opposite polarity from ScoreGauge:
 * here HIGHER = WORSE. Bands match the platform spec exactly:
 *   Low 0-30 (green) | Moderate 31-60 (amber) | High 61-100 (red)
 */
function bandColor(score) {
  if (score <= 30) return '#16A34A' // green — low risk
  if (score <= 60) return '#D97706' // amber — moderate risk
  return '#DC2626' // red — high risk
}

function bandLabel(score) {
  if (score <= 30) return 'Low Risk'
  if (score <= 60) return 'Moderate Risk'
  return 'High Risk'
}

export default function RiskGauge({ score = 0, size = 180 }) {
  const color = bandColor(score)
  const data = [{ name: 'risk', value: score, fill: color }]

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
