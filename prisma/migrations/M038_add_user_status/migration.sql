-- M038_add_user_status
-- Adiciona enum UserStatus e coluna status à tabela users
-- (ausente nas migrations anteriores mas presente no schema.prisma)

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
