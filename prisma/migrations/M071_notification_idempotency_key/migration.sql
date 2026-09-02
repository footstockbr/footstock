-- ============================================================================
-- M071 (paridade de dev) — coluna e indice unico de idempotencia em notifications.
--
-- A coluna idempotency_key e o indice notifications_idempotency_key_key ja
-- existem em PRODUCAO desde M059-notification-idempotency-email-status.sql, que
-- vive na arvore de migrations do footstock-next. O schema RAIZ (o do motor) e
-- que estava atrasado: nao declarava o campo, entao o client gerado do motor nao
-- o conhecia e nao havia como o motor gravar notificacao deduplicada.
--
-- Esta migration existe para que um banco de desenvolvimento criado so a partir
-- do schema raiz tenha as mesmas colunas. Em producao e integralmente no-op
-- (ambos os IF NOT EXISTS batem em objeto ja existente).
-- ============================================================================

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_key"
  ON "notifications" ("idempotency_key");
