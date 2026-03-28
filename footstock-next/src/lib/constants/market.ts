export enum MarketSession {
  PRE_ABERTURA = "PRE_ABERTURA",
  NEGOCIACAO = "NEGOCIACAO",
  CALL = "CALL",
  AFTER_MARKET = "AFTER_MARKET",
  FECHADO = "FECHADO",
}

export const SESSION_COLORS: Record<MarketSession, string> = {
  [MarketSession.PRE_ABERTURA]: "#c9a84c",
  [MarketSession.NEGOCIACAO]: "#8b5cf6",
  [MarketSession.CALL]: "#06b6d4",
  [MarketSession.AFTER_MARKET]: "#7c3aed",
  [MarketSession.FECHADO]: "#ef4444",
};

export const SESSION_LABELS: Record<MarketSession, string> = {
  [MarketSession.PRE_ABERTURA]: "Pré-Abertura",
  [MarketSession.NEGOCIACAO]: "Negociação",
  [MarketSession.CALL]: "Closing Call",
  [MarketSession.AFTER_MARKET]: "After Market",
  [MarketSession.FECHADO]: "Fechado",
};

export enum Sentiment {
  MUITO_POSITIVO = "MUITO_POSITIVO",
  POSITIVO = "POSITIVO",
  NEUTRO = "NEUTRO",
  NEGATIVO = "NEGATIVO",
  MUITO_NEGATIVO = "MUITO_NEGATIVO",
}

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  [Sentiment.MUITO_POSITIVO]: "Muito Alta",
  [Sentiment.POSITIVO]: "Alta",
  [Sentiment.NEUTRO]: "Neutro",
  [Sentiment.NEGATIVO]: "Baixa",
  [Sentiment.MUITO_NEGATIVO]: "Muito Baixa",
};
