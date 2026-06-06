import winston from 'winston'

export const REQUIRED_METRICS = [
  'motor_price_attribution_missing_total',
  'motor_tick_duration_ms',
  'order_flow_snapshot_duration_ms',
  'price_attribution_payload_bytes',
  'value_analysis_movements_total',
  'value_analysis_attribution_coverage_pct',
  'news_injection_duplicate_total',
] as const

export type RequiredMetricName = (typeof REQUIRED_METRICS)[number]

class MotorMetricsRegistry {
  private counters = new Map<string, number>()
  private observations = new Map<string, number[]>()
  private registered = new Set<string>(REQUIRED_METRICS)

  inc(name: RequiredMetricName, value = 1): void {
    this.registered.add(name)
    this.counters.set(name, (this.counters.get(name) ?? 0) + value)
  }

  observe(name: RequiredMetricName, value: number): void {
    this.registered.add(name)
    const current = this.observations.get(name) ?? []
    current.push(value)
    if (current.length > 1000) current.shift()
    this.observations.set(name, current)
  }

  setGauge(name: RequiredMetricName, value: number): void {
    this.registered.add(name)
    this.counters.set(name, value)
  }

  assertRequiredRegistered(): { ok: boolean; missing: string[] } {
    const missing = REQUIRED_METRICS.filter((metric) => !this.registered.has(metric))
    return { ok: missing.length === 0, missing }
  }

  snapshot(): Record<string, number | number[]> {
    return {
      ...Object.fromEntries(this.counters),
      ...Object.fromEntries(this.observations),
    }
  }
}

export const motorMetrics = new MotorMetricsRegistry()

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
})
