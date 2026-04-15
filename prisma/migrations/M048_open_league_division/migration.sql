-- M048_open_league_division
-- Renomeia a divisão 'ABERTA' para 'OPEN' em todas as ligas existentes.
-- Alinha banco com o spec T-006: 4 divisões (BRONZE, PRATA, OURO, OPEN).

UPDATE "leagues"
  SET "division" = 'OPEN'
  WHERE "division" = 'ABERTA';

-- down:
-- UPDATE "leagues" SET "division" = 'ABERTA' WHERE "division" = 'OPEN';
