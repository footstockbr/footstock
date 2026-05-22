-- ============================================================================
-- M056: Backfill assets.real_name para os 40 tickers canonicos
--
-- CONTEXTO
--   M042 adicionou a coluna real_name (nullable) sem backfill.
--   O seed (prisma/seed/assets.ts) que deveria popular o campo quebrou em
--   commit 215480d (Apr/2026) ao renomear ClubOption.name -> displayName sem
--   atualizar as chamadas do seed. Resultado: em prod todos os 40 registros
--   tem real_name = NULL, e o endpoint /api/v1/assets/clubs-for-selection
--   cai no fallback `realName ?? displayName`, exibindo o nome ficticio na
--   tela de cadastro em vez do nome real.
--
-- ESCOPO E IDEMPOTENCIA
--   Apenas popula real_name onde esta NULL E o ticker existe. Nao sobrescreve
--   overrides manuais. Nao exige que os 40 tickers existam — a migration nao
--   e responsavel por POPULAR registros, so o campo real_name. Criar/remover
--   registros e responsabilidade do seed (prisma/seed/assets.ts).
--   Nao toca em nenhum outro campo (preco, mercado, cores, divisao).
--
-- TRANSACAO
--   Prisma migrate envolve cada migration em transacao implicita. NAO USAR
--   BEGIN/COMMIT explicito aqui — causa "current transaction is aborted".
--
-- VALIDACAO
--   Apos o UPDATE, verifica se algum dos 40 tickers canonicos que EXISTE na
--   tabela ficou com real_name NULL. Se sim, RAISE EXCEPTION e a transacao
--   implicita do Prisma rolla tudo back. Tickers ausentes da tabela sao
--   ignorados (responsabilidade do seed).
--
-- COMO APLICAR
--   npx prisma migrate deploy
-- ============================================================================

-- Backfill atomico via VALUES. WHERE inclui `real_name IS NULL` para nao
-- sobrescrever overrides legitimos vindos do admin panel.
UPDATE assets AS a
SET real_name = v.real_name
FROM (
  VALUES
    -- Serie A
    ('URU3', 'Flamengo'),
    ('POR4', 'Palmeiras'),
    ('TIM3', 'Corinthians'),
    ('TRI4', 'São Paulo'),
    ('GAL3', 'Atlético-MG'),
    ('IMO3', 'Grêmio'),
    ('COL3', 'Internacional'),
    ('GUE4', 'Fluminense'),
    ('BAL4', 'Santos'),
    ('MAL4', 'Vasco da Gama'),
    ('FOG3', 'Botafogo'),
    ('FUR3', 'Athletico-PR'),
    ('FOR3', 'Fortaleza'),
    ('TRI3', 'Bahia'),
    ('RAP3', 'Cruzeiro'),
    ('RBB3', 'RB Bragantino'),
    ('CUI3', 'Cuiabá'),
    ('VIT3', 'Vitória'),
    ('JUV3', 'Juventude'),
    ('MIR3', 'Mirassol'),
    -- Serie B
    ('LEI3', 'Sport Recife'),
    ('NTL3', 'Novorizontino'),
    ('AVA3', 'Avaí'),
    ('GOI3', 'Goiás'),
    ('CHA3', 'Chapecoense'),
    ('PON3', 'Ponte Preta'),
    ('GUA3', 'Guarani'),
    ('OPE3', 'Operário-PR'),
    ('SAM3', 'Sampaio Corrêa'),
    ('TIS3', 'Vila Nova'),
    ('LON3', 'Londrina'),
    ('FIG3', 'Figueirense'),
    ('PAY3', 'Paysandu'),
    ('CFC3', 'Coritiba'),
    ('AME3', 'América-MG'),
    ('BSA3', 'Botafogo-SP'),
    ('CRB3', 'CRB'),
    ('CSA3', 'CSA'),
    ('ITA3', 'Ituano'),
    ('TON3', 'Tombense')
) AS v(ticker, real_name)
WHERE a.ticker = v.ticker
  AND a.real_name IS NULL;

-- Validacao: para cada ticker canonico que EXISTE na tabela, real_name deve
-- estar NOT NULL apos este UPDATE. Tickers ausentes sao ignorados (seed
-- responsavel por popular registros).
DO $$
DECLARE
  null_count INT;
  expected_tickers TEXT[] := ARRAY[
    'URU3','POR4','TIM3','TRI4','GAL3','IMO3','COL3','GUE4','BAL4','MAL4',
    'FOG3','FUR3','FOR3','TRI3','RAP3','RBB3','CUI3','VIT3','JUV3','MIR3',
    'LEI3','NTL3','AVA3','GOI3','CHA3','PON3','GUA3','OPE3','SAM3','TIS3',
    'LON3','FIG3','PAY3','CFC3','AME3','BSA3','CRB3','CSA3','ITA3','TON3'
  ];
BEGIN
  SELECT COUNT(*)
    INTO null_count
    FROM assets
   WHERE ticker = ANY(expected_tickers)
     AND real_name IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'M056 backfill incompleto: % tickers canonicos existentes ainda com real_name NULL',
      null_count;
  END IF;
END $$;
