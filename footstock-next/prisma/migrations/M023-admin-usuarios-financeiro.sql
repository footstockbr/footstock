-- Migration: M023-admin-usuarios-financeiro
-- Módulo: module-23-admin-usuarios-financeiro
-- Data: 2026-03-31

-- Adiciona campo status à tabela news (publicado/arquivado)
ALTER TABLE news ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);

-- Adiciona campos de suspensão à tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_users_suspended_at ON users(suspended_at) WHERE suspended_at IS NOT NULL;

-- Adiciona campo promote endpoint: garante que adminRole pode ser NULL (já é nullable)
-- Nenhuma alteração adicional necessária para promote (usa adminRole existente)
