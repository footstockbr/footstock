-- M041: Verificacao de Maioridade via CPF (T-023)
-- Cria enum VerificationMethod, tabela age_verifications e indices.
-- Campo ageVerificationPending ja existe na tabela users (migration anterior).

-- Enum para metodo de verificacao
CREATE TYPE "VerificationMethod" AS ENUM ('FLAGCHECK', 'AUTODECLARATION', 'ADMIN_OVERRIDE');

-- Tabela de historico de verificacoes de idade
CREATE TABLE "age_verifications" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "user_id"     TEXT NOT NULL,
  "cpf_hash"    VARCHAR(64) NOT NULL,
  "is_adult"    BOOLEAN NOT NULL,
  "method"      "VerificationMethod" NOT NULL,
  "verified_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "age_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "age_verifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Indices para consultas frequentes
CREATE INDEX "age_verifications_user_id_idx" ON "age_verifications"("user_id");
CREATE INDEX "age_verifications_cpf_hash_idx" ON "age_verifications"("cpf_hash");
