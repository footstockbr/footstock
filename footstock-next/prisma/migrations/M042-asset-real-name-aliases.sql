-- Migration M042: Asset realName + asset_aliases table
-- Parte do T-024: Nomes Fictícios de Clubes e Aliases de Ticker
--
-- IMPORTANTE: A coluna "name" existente na tabela assets permanece intacta.
-- Prisma passa a referenciá-la como "displayName" (via @map("name")).
-- Apenas adicionamos a coluna "real_name" (nullable) e a nova tabela "asset_aliases".

-- 1. Adicionar coluna real_name na tabela assets
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS real_name VARCHAR(100);

-- Comentário descritivo (PostgreSQL)
COMMENT ON COLUMN assets.real_name IS 'Nome real do clube (ex: Flamengo). USO SERVER-SIDE E ADMIN APENAS. Nunca retornar em endpoints públicos.';

-- 2. Criar tabela asset_aliases
CREATE TABLE IF NOT EXISTS asset_aliases (
  id           VARCHAR(30)  NOT NULL,
  alias        VARCHAR(10)  NOT NULL,
  asset_ticker VARCHAR(10)  NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT asset_aliases_pkey         PRIMARY KEY (id),
  CONSTRAINT asset_aliases_alias_unique  UNIQUE (alias),
  CONSTRAINT asset_aliases_asset_fkey    FOREIGN KEY (asset_ticker) REFERENCES assets(ticker) ON DELETE CASCADE
);

-- Índice para lookup rápido por alias + is_active
CREATE INDEX IF NOT EXISTS idx_asset_aliases_alias_active
  ON asset_aliases (alias, is_active);

COMMENT ON TABLE  asset_aliases IS 'Mapeamento de aliases de ticker do mundo real (FLA3) para tickers fictícios do sistema (URU3).';
COMMENT ON COLUMN asset_aliases.alias IS 'Ticker do mundo real normalizado em maiúsculas (ex: FLA3, FLA4, FLM3).';
COMMENT ON COLUMN asset_aliases.asset_ticker IS 'Ticker canônico fictício do sistema (ex: URU3).';
