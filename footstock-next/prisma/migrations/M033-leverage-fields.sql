-- ============================================================================
-- M032 — Alavancagem 2x: campo permiteAlavancagem em leagues
-- Rastreabilidade: T-003 / TASK-003-alavancagem-2x-lenda
-- ============================================================================

-- Adiciona toggle de alavancagem em ligas PRO.
-- Default false: ligas existentes não habilitam alavancagem por padrão.
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS permite_alavancagem BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leagues.permite_alavancagem
  IS 'Liga PRO pode autorizar ordens alavancadas 2x (plano Lenda). Default false.';
