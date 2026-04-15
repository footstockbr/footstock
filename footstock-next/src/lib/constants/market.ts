/** Sessões do pregão virtual (alinhado com Prisma SessionType) */
export enum MarketSession {
  PRE_OPENING = "PRE_OPENING",
  TRADING = "TRADING",
  CLOSING_CALL = "CLOSING_CALL",
  AFTER_MARKET = "AFTER_MARKET",
  CLOSED = "CLOSED",
}

export const SESSION_COLORS: Record<MarketSession, string> = {
  [MarketSession.PRE_OPENING]: "#F97316",
  [MarketSession.TRADING]: "#EAB308",
  [MarketSession.CLOSING_CALL]: "#06B6D4",
  [MarketSession.AFTER_MARKET]: "#7C3AED",
  [MarketSession.CLOSED]: "#EF4444",
};

export const SESSION_LABELS: Record<MarketSession, string> = {
  [MarketSession.PRE_OPENING]: "Pré-Abertura",
  [MarketSession.TRADING]: "Negociação",
  [MarketSession.CLOSING_CALL]: "Call de Fechamento",
  [MarketSession.AFTER_MARKET]: "After-Market",
  [MarketSession.CLOSED]: "Mercado Fechado",
};

/** Coeficientes de volatilidade por sessao (canonico — T-008) */
export const SESSION_VOLATILITY: Record<MarketSession, number> = {
  [MarketSession.PRE_OPENING]: 0.30,
  [MarketSession.TRADING]: 1.00,
  [MarketSession.CLOSING_CALL]: 0.20,
  [MarketSession.AFTER_MARKET]: 0.10,
  [MarketSession.CLOSED]: 0.00,
};

/** Horarios BRT de cada sessao (America/Sao_Paulo, UTC-3) */
export const SESSION_SCHEDULE_BRT: Record<MarketSession, { start: string; end: string }> = {
  [MarketSession.PRE_OPENING]: { start: '10:45', end: '11:00' },
  [MarketSession.TRADING]: { start: '11:00', end: '00:45' },
  [MarketSession.CLOSING_CALL]: { start: '00:45', end: '01:00' },
  [MarketSession.AFTER_MARKET]: { start: '01:00', end: '01:30' },
  [MarketSession.CLOSED]: { start: '01:30', end: '10:45' },
};

/**
 * Nível de sentimento para exibição no UI (5 valores).
 * NÃO é o Prisma Sentiment (BULLISH/BEARISH/NEUTRAL) — usado para labels de notícias.
 */
export enum NewsSentimentLevel {
  MUITO_POSITIVO = "MUITO_POSITIVO",
  POSITIVO = "POSITIVO",
  NEUTRO = "NEUTRO",
  NEGATIVO = "NEGATIVO",
  MUITO_NEGATIVO = "MUITO_NEGATIVO",
}

export const NEWS_SENTIMENT_LABELS: Record<NewsSentimentLevel, string> = {
  [NewsSentimentLevel.MUITO_POSITIVO]: "Muito Alta",
  [NewsSentimentLevel.POSITIVO]: "Alta",
  [NewsSentimentLevel.NEUTRO]: "Neutro",
  [NewsSentimentLevel.NEGATIVO]: "Baixa",
  [NewsSentimentLevel.MUITO_NEGATIVO]: "Muito Baixa",
};
