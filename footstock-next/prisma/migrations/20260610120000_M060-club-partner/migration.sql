-- M060: tabela club_partners — dados bancários do clube parceiro para repasse
-- de royalties. Corrige rota /api/v1/club/affiliate/bank que referenciava o
-- modelo inexistente `clubPartner` e sempre retornava 500.
-- Idempotente: pode rodar via `prisma migrate deploy` mesmo após aplicação manual.

CREATE TABLE IF NOT EXISTS club_partners (
  club_id    text PRIMARY KEY,
  bank_data  jsonb,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
