-- M054: add nullable password_hash column to users for Auth.js v5 Credentials provider.
-- Coexiste com Supabase Auth durante a janela de fallback (NXAUTH dual-stack).
-- Rollback: ALTER TABLE "users" DROP COLUMN "password_hash";

ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
