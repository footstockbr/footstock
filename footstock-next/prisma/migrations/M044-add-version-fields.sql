-- M044 — Locking Otimista: campo version em users, orders e positions
-- Rastreabilidade: T-032 / Locking Otimista via Campo Version para Conflitos de Saldo

-- users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

-- orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

-- positions
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

-- Índices para acelerar WHERE id = ? AND version = ? nas queries de CAS
CREATE INDEX IF NOT EXISTS idx_users_id_version    ON users    (id, version);
CREATE INDEX IF NOT EXISTS idx_orders_id_version   ON orders   (id, version);
CREATE INDEX IF NOT EXISTS idx_positions_id_version ON positions (id, version);
