-- ============================================================================
-- Migration M034: Dividendos 3 Modalidades (T-007)
-- Adiciona campos a `dividends` e cria tabela `yield_differential_pending`.
-- Compatível com dados existentes (todos os novos campos são nullable ou têm default).
-- ============================================================================

-- 1. Adicionar novos campos à tabela dividends
ALTER TABLE "dividends"
  ADD COLUMN IF NOT EXISTS "snapshot_date"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "shares_snapshot"  DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS "price_per_share"  DECIMAL(18,8);

-- Índice composto para filtro por userId + tipo
CREATE INDEX IF NOT EXISTS "dividends_user_id_type_idx"
  ON "dividends" ("user_id", "type");

-- 2. Criar tabela yield_differential_pending
CREATE TABLE IF NOT EXISTS "yield_differential_pending" (
  "id"                       TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"                  TEXT         NOT NULL,
  "ticker"                   TEXT         NOT NULL,
  "source_type"              TEXT         NOT NULL,
  "source_dividend_id"       TEXT,
  "snapshot_date"            TIMESTAMPTZ  NOT NULL,
  "shares_snapshot"          DECIMAL(18,8) NOT NULL,
  "pending_amount"           DECIMAL(18,8) NOT NULL DEFAULT 0,
  "status"                   TEXT         NOT NULL DEFAULT 'PENDING',
  "realized_at"              TIMESTAMPTZ,
  "realized_transaction_id"  TEXT,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "yield_differential_pending_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "yield_differential_pending_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "yield_differential_pending_dividend_fk"
    FOREIGN KEY ("source_dividend_id") REFERENCES "dividends"("id") ON DELETE SET NULL,
  -- Evita duplicação por evento por usuário
  CONSTRAINT "yield_differential_pending_user_dividend_unique"
    UNIQUE ("user_id", "source_dividend_id")
);

-- Índices para consultas do frontend e do YieldRealizeService
CREATE INDEX IF NOT EXISTS "ydp_user_status_idx"
  ON "yield_differential_pending" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "ydp_user_ticker_idx"
  ON "yield_differential_pending" ("user_id", "ticker");

-- Trigger para auto-update de updated_at
CREATE OR REPLACE FUNCTION update_ydp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ydp_updated_at_trigger ON "yield_differential_pending";
CREATE TRIGGER ydp_updated_at_trigger
  BEFORE UPDATE ON "yield_differential_pending"
  FOR EACH ROW EXECUTE FUNCTION update_ydp_updated_at();

-- Comentários descritivos
COMMENT ON TABLE "yield_differential_pending" IS
  'Accrual de yield diferencial para usuários JOGADOR. Realizado proporcionalmente na venda da posição.';
COMMENT ON COLUMN "yield_differential_pending"."status" IS
  'PENDING = não realizado | REALIZED = realizado na venda | UPGRADED = migrado por upgrade de plano';
COMMENT ON COLUMN "dividends"."snapshot_date" IS
  'Data de corte de acionistas. Usuários com posição nesta data recebem o dividendo.';
