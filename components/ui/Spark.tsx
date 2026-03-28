export interface SparkProps {
  /** Array de valores para o sparkline */
  data: number[]
  /** Largura em px */
  width?: number
  /** Altura em px */
  height?: number
  className?: string
}

/**
 * Sparkline SVG minimalista para historico de preco.
 * Tamanho padrao: 60x28px.
 */
export function Spark({ data, width = 60, height = 28, className }: SparkProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const isPositive = data[data.length - 1]! >= data[0]!
  const color = isPositive ? 'var(--price-up)' : 'var(--price-down)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
