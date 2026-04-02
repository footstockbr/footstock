-- M037: Corrigir Dividend.amount Float → Decimal(18,8)
-- Impacto: sem perda de dados — Float → Decimal é upcast seguro
ALTER TABLE "dividends" ALTER COLUMN "amount" TYPE DECIMAL(18,8);
