-- M057 — Remover coluna age_verification_pending (remocao completa do FlagCheck)
--
-- A verificacao de maioridade passou a ser pura autodeclaracao: o calculo de
-- idade pela data de nascimento basta para bloquear menores no registro, entao
-- nao existe mais estado "pendente". Toda a infra FlagCheck (service, job de
-- retry, cron, middleware requireAgeVerified, telas/badges) foi removida do
-- codigo nesta mesma entrega.
--
-- Mantidos deliberadamente (drop seria destrutivo / desnecessario):
--   - tabela age_verifications + enum VerificationMethod (auditoria; segue
--     gravando AUTODECLARATION no registro)
--   - valor de enum NotificationType.AGE_VERIFICATION_PENDING (Postgres nao
--     remove valor de enum facilmente; apenas paramos de emiti-lo)

ALTER TABLE "users" DROP COLUMN IF EXISTS "age_verification_pending";
