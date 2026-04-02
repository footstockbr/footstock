-- ============================================================================
-- M021: Module-14 Orders Engine
-- Adiciona suporte a OCO, SCHEDULED, short selling, alavancagem e auditoria
-- de integridade de transações.
-- ============================================================================

-- 1. Novos valores no enum OrderType
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'OCO';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'SCHEDULED';

-- 2. Novos enums
DO $$ BEGIN
  CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialType" AS ENUM (
    'TRADE', 'BONUS', 'DEPOSIT', 'WITHDRAWAL',
    'SHORT_INTEREST', 'MARGIN_BLOCKED', 'SHORT_CLOSE', 'LEVERAGE_INTEREST'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Colunas no User
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS margin_blocked DECIMAL(18,2) NOT NULL DEFAULT 0;

-- 4. Colunas no Order
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS group_id TEXT,
  ADD COLUMN IF NOT EXISTS leverage_multiplier SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "orders_group_id_idx" ON orders (group_id) WHERE group_id IS NOT NULL;

-- 5. Colunas no Position
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS side "PositionSide" NOT NULL DEFAULT 'LONG',
  ADD COLUMN IF NOT EXISTS status "PositionStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS margin_blocked DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leverage_multiplier SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS leverage_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_interest_rate DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_accrued DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- Remove unique constraint que impediria múltiplas posições SHORT + LONG para o mesmo ativo
-- (manter apenas se não existir posição SHORT; abordagem: permitir duplicatas via índice composto)
ALTER TABLE positions DROP CONSTRAINT IF EXISTS "positions_user_id_asset_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "positions_user_asset_side_key"
  ON positions (user_id, asset_id, side)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS "positions_user_status_idx" ON positions (user_id, status);

-- 6. Colunas no Transaction
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS financial_type "FinancialType" NOT NULL DEFAULT 'TRADE',
  ADD COLUMN IF NOT EXISTS fs_amount DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS balance_before DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS balance_after DECIMAL(18,2);
