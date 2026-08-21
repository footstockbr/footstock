export type SentimentStalenessState = 'FRESCO' | 'OBSOLETO' | 'PAUSADO' | 'NUNCA_ESCRITO'

const DEFAULT_STALE_THRESHOLD_SECONDS = 300

export function resolveStalenessThreshold(): number {
  const raw = Number(process.env.STALE_SENTIMENT_THRESHOLD_SECONDS ?? DEFAULT_STALE_THRESHOLD_SECONDS)
  if (!Number.isFinite(raw) || raw <= 0) {
    if (process.env.STALE_SENTIMENT_THRESHOLD_SECONDS !== undefined) {
      console.warn(
        `[sentiment-staleness] STALE_SENTIMENT_THRESHOLD_SECONDS invalido (${process.env.STALE_SENTIMENT_THRESHOLD_SECONDS}), usando default ${DEFAULT_STALE_THRESHOLD_SECONDS}s`
      )
    }
    return DEFAULT_STALE_THRESHOLD_SECONDS
  }
  return raw
}

export function classifySentimentStaleness(
  sentimentUpdatedAt: Date | null,
  isHalted: boolean,
  thresholdSeconds: number,
  now: Date
): { state: SentimentStalenessState; ageSeconds: number | null } {
  if (isHalted) {
    return { state: 'PAUSADO', ageSeconds: null }
  }
  if (!sentimentUpdatedAt) {
    return { state: 'NUNCA_ESCRITO', ageSeconds: null }
  }
  const ageSeconds = Math.floor(
    (now.getTime() - sentimentUpdatedAt.getTime()) / 1000
  )
  if (ageSeconds > thresholdSeconds) {
    return { state: 'OBSOLETO', ageSeconds }
  }
  return { state: 'FRESCO', ageSeconds }
}
