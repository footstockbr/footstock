-- M044: Corrige valores do campo division nos 40 ativos
-- Garante que todos os tickers estejam com a divisao correta (SERIE_A / SERIE_B)
-- baseado na lista canonica do INTAKE.

-- Série A (20 ativos)
UPDATE "assets"
SET "division" = 'SERIE_A'
WHERE "ticker" IN (
  'URU3','POR4','TIM3','TRI4','GAL3','FOG3','COL3','IMO3','RAP3','MAL4',
  'TRI3','GUE4','TOR3','LEM3','BAL4','FUR3','VOA4','CON3','LEA3','LEB3'
);

-- Série B (20 ativos)
UPDATE "assets"
SET "division" = 'SERIE_B'
WHERE "ticker" IN (
  'COE3','CAV4','DRA3','LEI4','PAN3','VOZ3','GAP3','TIG4','DOU4','LEP4',
  'PER3','IND4','TUB3','NAF3','TIV3','FAS3','MAC4','ABT4','LEI3','TIS3'
);
