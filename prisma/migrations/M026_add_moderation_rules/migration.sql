-- M026: Cria tabela de regras de moderação (fallback DB para Redis)
-- Fonte: module-24/TASK-2

CREATE TABLE IF NOT EXISTS "moderation_rules" (
  "id"          INTEGER NOT NULL,
  "name"        VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "config"      JSONB,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "moderation_rules_pkey" PRIMARY KEY ("id")
);

-- Seed com as 5 regras padrão
INSERT INTO "moderation_rules" ("id", "name", "description", "enabled", "config") VALUES
  (1, 'Auto-Delete 3 Flags', 'Deletar posts que recebam 3 ou mais denúncias', false, NULL),
  (2, 'IP Burst Ban', 'Banir IP após 5 posts em 1 minuto', false, NULL),
  (3, 'Hide Suspended', 'Ocultar posts de usuários suspensos (visível apenas para admin)', false, NULL),
  (4, 'New User Ticker Restrict', 'Proibir posts sobre tickers específicos para contas com menos de 7 dias', false, '{"restrictedTickers": [], "minAccountAgeDays": 7}'),
  (5, 'Hourly Post Limit', 'Limite de 5 posts por hora por usuário (configurável pelo SuperAdmin)', false, '{"limit": 5}')
ON CONFLICT ("id") DO NOTHING;
