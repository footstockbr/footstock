/** Sessões do pregão virtual (alinhado com Prisma SessionType) */
export enum MarketSession {
  PRE_MARKET = "PRE_MARKET",
  REGULAR = "REGULAR",
  AFTER_MARKET = "AFTER_MARKET",
  CLOSED = "CLOSED",
}

export const SESSION_COLORS: Record<MarketSession, string> = {
  [MarketSession.PRE_MARKET]: "#F0B90B",
  [MarketSession.REGULAR]: "#2EBD85",
  [MarketSession.AFTER_MARKET]: "#707A8A",
  [MarketSession.CLOSED]: "#F6465D",
};

export const SESSION_LABELS: Record<MarketSession, string> = {
  [MarketSession.PRE_MARKET]: "Pré-Abertura",
  [MarketSession.REGULAR]: "Negociação",
  [MarketSession.AFTER_MARKET]: "After Market",
  [MarketSession.CLOSED]: "Fechado",
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
