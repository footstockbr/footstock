-- M052: adiciona coluna halted_until em assets
-- Circuit breaker automatico passa a persistir o timestamp de expiracao do halt.
-- Coluna nullable: halt admin (FORCE_CIRCUIT_BREAKER, etc.) nao tem expiracao.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS halted_until TIMESTAMPTZ;
