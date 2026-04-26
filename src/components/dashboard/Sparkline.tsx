/**
 * Sparkline — Mini graphique inline (SVG, pas de lib).
 */

interface Props {
  data: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
}

export default function Sparkline({ data, color = '#6366f1', width = 80, height = 24, fill = true }: Props) {
  if (data.length === 0) return <svg width={width} height={height} />

  const max = Math.max(1, ...data)
  const min = 0
  const stepX = data.length > 1 ? width / (data.length - 1) : 0

  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / (max - min)) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const areaPath = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <path d={areaPath} fill={color} fillOpacity={0.15} />}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) * stepX}
          cy={height - ((data[data.length - 1] - min) / (max - min)) * (height - 2) - 1}
          r={2}
          fill={color}
        />
      )}
    </svg>
  )
}
