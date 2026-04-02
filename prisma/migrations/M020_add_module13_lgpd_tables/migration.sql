-- M020_add_module13_lgpd_tables
-- Module 13: LGPD Compliance — tabelas de consentimento, log de acesso, export e incidentes
-- TASK-0: Foundation (ST001-ST004)

-- ─── 1. Atualizar enum ConsentPurpose ────────────────────────────────────────
-- Renomear TERMS → ESSENTIAL
ALTER TYPE "ConsentPurpose" RENAME VALUE 'TERMS' TO 'ESSENTIAL';

-- Renomear THIRD_PARTY → DATA_TERCEIROS
ALTER TYPE "ConsentPurpose" RENAME VALUE 'THIRD_PARTY' TO 'DATA_TERCEIROS';

-- Adicionar AGE_VERIFICATION
ALTER TYPE "ConsentPurpose" ADD VALUE IF NOT EXISTS 'AGE_VERIFICATION';

-- ─── 2. Atualizar tabela consents ─────────────────────────────────────────────
-- Tornar granted_at nullable (upsert pode criar sem data)
ALTER TABLE "consents" ALTER COLUMN "granted_at" DROP NOT NULL;

-- Adicionar campos de contexto
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Atualizar onDelete: CASCADE na FK de consents → users
ALTER TABLE "consents" DROP CONSTRAINT IF EXISTS "consents_user_id_fkey";
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ─── 3. Atualizar tabela data_access_logs ─────────────────────────────────────
-- Remover colunas antigas (incompatíveis com novo modelo)
ALTER TABLE "data_access_logs" DROP COLUMN IF EXISTS "action";
ALTER TABLE "data_access_logs" DROP COLUMN IF EXISTS "resource_type";
ALTER TABLE "data_access_logs" DROP COLUMN IF EXISTS "resource_id";
ALTER TABLE "data_access_logs" DROP COLUMN IF EXISTS "user_agent";

-- Adicionar novas colunas
ALTER TABLE "data_access_logs" ADD COLUMN IF NOT EXISTS "accessed_by" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "data_access_logs" ADD COLUMN IF NOT EXISTS "data_type" TEXT NOT NULL DEFAULT 'profile';
ALTER TABLE "data_access_logs" ADD COLUMN IF NOT EXISTS "endpoint" TEXT NOT NULL DEFAULT '/unknown';
ALTER TABLE "data_access_logs" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- Atualizar índice composto
DROP INDEX IF EXISTS "data_access_logs_user_id_idx";
CREATE INDEX IF NOT EXISTS "data_access_logs_user_id_created_at_idx" ON "data_access_logs"("user_id", "created_at");

-- Atualizar onDelete: CASCADE na FK de data_access_logs → users
ALTER TABLE "data_access_logs" DROP CONSTRAINT IF EXISTS "data_access_logs_user_id_fkey";
ALTER TABLE "data_access_logs" ADD CONSTRAINT "data_access_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ─── 4. Atualizar tabela users ────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_verification_pending" BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 5. Criar enum ExportJobStatus ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── 6. Criar tabela data_export_jobs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "data_export_jobs" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"      TEXT NOT NULL,
  "status"       "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "format"       TEXT NOT NULL DEFAULT 'json+csv',
  "file_path"    TEXT,
  "download_url" TEXT,
  "expires_at"   TIMESTAMP(3),
  "error"        TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_export_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "data_export_jobs_user_id_created_at_idx"
  ON "data_export_jobs"("user_id", "created_at");

-- ─── 7. Criar tabela incident_logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "incident_logs" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "type"             TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "affected_users"   INTEGER NOT NULL,
  "data_types"       TEXT[] NOT NULL,
  "detected_at"      TIMESTAMP(3) NOT NULL,
  "contained_at"     TIMESTAMP(3),
  "estimated_impact" TEXT NOT NULL,
  "report"           TEXT NOT NULL,
  "notified_at"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "email_sent"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "incident_logs_pkey" PRIMARY KEY ("id")
);
