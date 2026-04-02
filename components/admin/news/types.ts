export type EditorialStatus = 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
export type Impact =
  | 'FINANCEIRA_CRITICA'
  | 'ESPORTIVA_MAJORITARIA'
  | 'MERCADO_ATIVOS'
  | 'INTEGRIDADE_SAUDE'
  | 'INSTITUCIONAL'
  | 'ESPORTIVA_MENOR'
export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export interface EditorialNews {
  id: string
  title: string
  content: string
  impact: Impact
  sentiment: Sentiment
  source: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  tickers: string[]
  ticker: string | null
  status: EditorialStatus
}

export interface FormState {
  title: string
  content: string
  ticker: string
  impact: Impact
  sentiment: Sentiment
  source: string
  status: EditorialStatus
}

export const STATUS_LABEL: Record<EditorialStatus, string> = {
  PUBLISHED: 'Publicada',
  DRAFT: 'Rascunho',
  ARCHIVED: 'Arquivada',
}

export const STATUS_BADGE: Record<EditorialStatus, string> = {
  PUBLISHED: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
  DRAFT: 'border-zinc-700 bg-zinc-800 text-zinc-300',
  ARCHIVED: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
}

export const IMPACT_OPTIONS: Array<{ value: Impact; label: string }> = [
  { value: 'FINANCEIRA_CRITICA', label: 'Financeira Critica (+/-5%)' },
  { value: 'ESPORTIVA_MAJORITARIA', label: 'Esportiva Majoritaria (+/-3%)' },
  { value: 'MERCADO_ATIVOS', label: 'Mercado de Ativos (+/-2%)' },
  { value: 'INTEGRIDADE_SAUDE', label: 'Integridade/Saude (+/-1.5%)' },
  { value: 'INSTITUCIONAL', label: 'Institucional (+/-1%)' },
  { value: 'ESPORTIVA_MENOR', label: 'Esportiva Menor (+/-0.5%)' },
]

export const SENTIMENT_OPTIONS: Array<{ value: Sentiment; label: string }> = [
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
  { value: 'NEUTRAL', label: 'Neutro' },
]

export const EMPTY_FORM: FormState = {
  title: '',
  content: '',
  ticker: '',
  impact: 'INSTITUCIONAL',
  sentiment: 'NEUTRAL',
  source: '',
  status: 'DRAFT',
}
