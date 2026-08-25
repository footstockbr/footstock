-- M069: snapshot de custo e resultado realizado por transacao.
-- Puramente aditiva: 4 colunas nullable, 1 foreign key com ON DELETE SET NULL e
-- 1 indice composto. Nao toca nenhuma constraint existente da tabela transactions
-- (em especial o indice unico parcial uq_tx_order_financial de
-- M054-orderflow-perfect-model.sql, que limita 1 TRADE + 1 FEE por ordem e
-- continua valendo sem alteracao).
--
-- Sem backfill: transacoes legadas ficam com os quatro campos NULL e a UI deve
-- exibir "Indisponivel" nesses casos.
--
-- position_id: posicao afetada pela transacao (NULL em lancamentos sem posicao,
--   como BONUS, DEPOSIT, WITHDRAWAL, e em todo o acervo legado).
-- avg_price_at_execution: preco medio da posicao no instante da execucao,
--   DECIMAL(18,8) para casar exatamente com positions.avg_price.
-- cost_basis_amount: custo da parcela vendida (avg_price_at_execution * quantidade).
-- realized_pnl: resultado realizado da operacao, ja liquido da taxa.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "position_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "avg_price_at_execution" DECIMAL(18,8);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cost_basis_amount" DECIMAL(18,2);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "realized_pnl" DECIMAL(18,2);

CREATE INDEX IF NOT EXISTS "transactions_position_id_created_at_idx"
  ON "transactions" ("position_id", "created_at");

-- FK idempotente: ADD CONSTRAINT nao aceita IF NOT EXISTS no Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_position_id_fkey'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_position_id_fkey"
      FOREIGN KEY ("position_id") REFERENCES "positions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
