-- M043: Adiciona campos do motor ao model Asset
-- Campos necessarios para: L2_Anchor (fairValue), L6_SupplyScaling (currentSupply/totalShares),
-- L9_CircuitBreaker (isHalted/haltReason), SentimentGauge (sentiment), AssetDetail (financials)

-- Fair value: ancora do Ornstein-Uhlenbeck (L2_Anchor)
ALTER TABLE "assets" ADD COLUMN "fair_value" DECIMAL(18, 8) NOT NULL DEFAULT 0;

-- Supply: float disponivel e total de acoes emitidas (L6_SupplyScaling)
ALTER TABLE "assets" ADD COLUMN "current_supply" BIGINT NOT NULL DEFAULT 1000000;
ALTER TABLE "assets" ADD COLUMN "total_shares" BIGINT NOT NULL DEFAULT 1000000;

-- Circuit breaker: halt individual por ativo (L9_CircuitBreaker + admin)
ALTER TABLE "assets" ADD COLUMN "is_halted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assets" ADD COLUMN "halt_reason" TEXT;

-- Sentimento de mercado: BULLISH | BEARISH | NEUTRAL
ALTER TABLE "assets" ADD COLUMN "sentiment" TEXT NOT NULL DEFAULT 'NEUTRAL';

-- Dados financeiros do clube (receita, elenco, marca, divida, EV multiplier)
ALTER TABLE "assets" ADD COLUMN "financials" JSONB;
