-- Migration: M025-impact-matrix-config
-- Matriz de Impacto de Notícias no Motor de Mercado
-- Define o impacto spot máximo por categoria de notícia

CREATE TABLE IF NOT EXISTS impact_matrix_configs (
  id                        TEXT        PRIMARY KEY,
  financeira_critica        NUMERIC(5,3) NOT NULL DEFAULT 0.050,
  esportiva_majoritaria     NUMERIC(5,3) NOT NULL DEFAULT 0.030,
  mercado_ativos            NUMERIC(5,3) NOT NULL DEFAULT 0.020,
  integridade_saude         NUMERIC(5,3) NOT NULL DEFAULT 0.015,
  institucional             NUMERIC(5,3) NOT NULL DEFAULT 0.010,
  esportiva_menor           NUMERIC(5,3) NOT NULL DEFAULT 0.005,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                TEXT        NULL
);

-- Seed: configuração padrão (singleton)
INSERT INTO impact_matrix_configs (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
