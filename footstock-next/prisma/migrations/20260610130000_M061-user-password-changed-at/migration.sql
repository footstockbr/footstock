-- M061: coluna users.password_changed_at — marca-d'água para invalidação de
-- sessão na troca de senha. Tokens JWT (stateless) com iat anterior a este
-- instante são rejeitados em getAuthUser, deslogando outras sessões.
-- Idempotente: pode rodar via `prisma migrate deploy` mesmo após aplicação manual.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamp(3);
