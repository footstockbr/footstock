export type CauseType =
  | 'ADMIN_ACTION'
  | 'NEWS'
  | 'MARKET_FLOW'
  | 'SIMULATED_ENGINE'
  | 'UNEXPLAINED'

export type Confidence = 'alta' | 'media' | 'baixa'
export type MovementMagnitude = 'neutra' | 'baixa' | 'moderada' | 'alta' | 'critica'

export const CAUSE_LABELS_FOR_API: Record<CauseType, string> = {
  ADMIN_ACTION: 'ação administrativa',
  NEWS: 'notícia vinculada',
  MARKET_FLOW: 'fluxo de negociação',
  SIMULATED_ENGINE: 'motor de precificação',
  UNEXPLAINED: 'sem causa registrada',
}

export type NewsEvidence = {
  id: string
  title: string
  source: string | null
  sentiment: string
  impact: string
  occurredAt: string
  href: string
}

export type AdminActionEvidence = {
  id: string
  action: string
  reason: string | null
  previousPrice: number | null
  newPrice: number | null
  occurredAt: string
  href: string
}

export function pct(previous: number, current: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 10000) / 100
}

export function magnitudeFromPct(value: number): MovementMagnitude {
  const abs = Math.abs(value)
  if (abs === 0) return 'neutra'
  if (abs < 0.5) return 'baixa'
  if (abs < 2) return 'moderada'
  if (abs < 5) return 'alta'
  return 'critica'
}

export function confidenceScore(confidence: Confidence, causeType: CauseType): number {
  const base = confidence === 'alta' ? 90 : confidence === 'media' ? 65 : 35
  if (causeType === 'UNEXPLAINED') return Math.min(base, 25)
  if (causeType === 'MARKET_FLOW') return Math.min(base, 45)
  return base
}

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance)
}

export function extractActionReason(action: { reason: string | null; details: unknown }): string | null {
  if (action.reason) return action.reason
  if (!action.details || typeof action.details !== 'object') return null
  const details = action.details as Record<string, unknown>
  const detailReason = details.reason
  if (typeof detailReason === 'string') return detailReason
  const payload = details.payload
  if (payload && typeof payload === 'object') {
    const payloadReason = (payload as Record<string, unknown>).reason
    if (typeof payloadReason === 'string') return payloadReason
  }
  return null
}

export function eventTime(news: { publishedAt: Date | null; createdAt: Date }): Date {
  return news.publishedAt ?? news.createdAt
}

export function inWindow(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

export function sentimentMatchesDirection(sentiment: string, direction: 'up' | 'down'): boolean {
  return (
    (sentiment === 'BULLISH' && direction === 'up') ||
    (sentiment === 'BEARISH' && direction === 'down') ||
    sentiment === 'NEUTRAL'
  )
}

export function buildCause(params: {
  direction: 'up' | 'down'
  volumeDelta: number
  source: string
  news: NewsEvidence[]
  adminActions: AdminActionEvidence[]
}): { causeType: CauseType; causeLabel: string; confidence: Confidence; explanation: string } {
  const { direction, volumeDelta, source, news, adminActions } = params

  const explicitPriceAction = adminActions.find((action) => action.previousPrice !== null || action.newPrice !== null)
  if (explicitPriceAction) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ajuste administrativo',
      confidence: 'alta',
      explanation: explicitPriceAction.reason
        ? `Variação associada a ação administrativa ${explicitPriceAction.action}: ${explicitPriceAction.reason}`
        : `Variação associada a ação administrativa ${explicitPriceAction.action}.`,
    }
  }

  if (adminActions.length > 0 && news.length > 0) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ação administrativa com notícia no período',
      confidence: 'media',
      explanation: `Houve ${adminActions.length} ação administrativa e ${news.length} notícia vinculada na janela da mudança. Atribuição principal: intervenção operacional registrada pelo admin.`,
    }
  }

  const directionalNews = news.find((item) => sentimentMatchesDirection(item.sentiment, direction))
  if (directionalNews) {
    return {
      causeType: 'NEWS',
      causeLabel: 'Notícia vinculada',
      confidence: 'media',
      explanation: `A mudança coincide com a notícia "${directionalNews.title}", com sentimento ${directionalNews.sentiment} e impacto ${directionalNews.impact}.`,
    }
  }

  if (news.length > 0) {
    return {
      causeType: 'NEWS',
      causeLabel: 'Notícia vinculada, direção divergente',
      confidence: 'baixa',
      explanation: 'Existe notícia vinculada no período, mas o sentimento registrado não explica diretamente a direção da variação.',
    }
  }

  if (adminActions.length > 0) {
    return {
      causeType: 'ADMIN_ACTION',
      causeLabel: 'Ação administrativa',
      confidence: 'media',
      explanation: `A mudança ocorreu próxima de ${adminActions.length} ação administrativa, sem preço anterior/novo registrado para confirmar ajuste direto.`,
    }
  }

  if (source !== 'REAL') {
    return {
      causeType: 'SIMULATED_ENGINE',
      causeLabel: 'Motor de preço',
      confidence: 'media',
      explanation: `O candle foi gerado pela fonte ${source}; sem notícia ou ação administrativa vinculada, a variação parece vir do motor de precificação.`,
    }
  }

  if (volumeDelta > 0) {
    return {
      causeType: 'MARKET_FLOW',
      causeLabel: 'Fluxo de negociação',
      confidence: 'baixa',
      explanation: `Não há notícia ou intervenção administrativa na janela. O volume aumentou em ${volumeDelta.toLocaleString('pt-BR')} unidades, sugerindo pressão de compra/venda dos usuários.`,
    }
  }

  return {
    causeType: 'UNEXPLAINED',
    causeLabel: 'Sem causa registrada',
    confidence: 'baixa',
    explanation: 'Não foram encontrados notícia, ação administrativa ou aumento de volume suficientes para explicar a mudança com os dados disponíveis.',
  }
}

export function buildDiagnosticNotes(params: {
  movementPct: number
  volumeDelta: number
  source: string
  news: NewsEvidence[]
  adminActions: AdminActionEvidence[]
  confidence: Confidence
  causeType: CauseType
}): string[] {
  const notes: string[] = []
  const absPct = Math.abs(params.movementPct)

  notes.push(`Magnitude ${magnitudeFromPct(params.movementPct)}: ${round2(absPct)}% entre os dois pontos de preço.`)

  if (params.news.length > 0) {
    notes.push(`${params.news.length} notícia(s) encontrada(s) na janela de correlação.`)
  } else {
    notes.push('Nenhuma notícia vinculada ao ativo foi encontrada na janela de correlação.')
  }

  if (params.adminActions.length > 0) {
    notes.push(`${params.adminActions.length} ação(ões) administrativa(s) próxima(s) ao movimento.`)
  }

  if (params.volumeDelta > 0) {
    notes.push(`Volume incremental de ${params.volumeDelta.toLocaleString('pt-BR')} unidades no período.`)
  }

  if (params.source !== 'REAL') {
    notes.push(`Fonte do candle: ${params.source}. A leitura pode refletir simulação do motor.`)
  }

  if (params.confidence === 'baixa' || params.causeType === 'UNEXPLAINED') {
    notes.push('Atribuição causal fraca: faltam evidências diretas suficientes para afirmar o motivo.')
  }

  return notes
}

export function causePriority(cause: CauseType): number {
  return {
    ADMIN_ACTION: 5,
    NEWS: 4,
    MARKET_FLOW: 3,
    SIMULATED_ENGINE: 2,
    UNEXPLAINED: 1,
  }[cause]
}
