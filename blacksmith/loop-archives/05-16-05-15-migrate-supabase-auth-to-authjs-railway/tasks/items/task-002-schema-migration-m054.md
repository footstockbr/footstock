---
description: Task 002 - TASK-1 Schema migration M054 (add User.passwordHash) + type augmentation NextAuth
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 002 - TASK-1: Schema migration M054 + type augmentation

Origem: `source.md` linhas 58-75 (Item 1 - TASK-1).

## Contexto

Adicionar coluna `passwordHash TEXT NULL` ao `User` e augment dos tipos do NextAuth para refletir custom fields. Postgres 14+: `ADD COLUMN` nullable sem default = metadata-only, non-blocking, instantaneo, sem table rewrite, sem lock pesado.

## Arquivos tocados

- `footstock-next/prisma/schema.prisma` - adicionar `passwordHash String?` no model `User` (sem index).
- `footstock-next/prisma/migrations/M054-add-password-hash/migration.sql` (novo).
- `footstock-next/src/types/next-auth.d.ts` (novo) - augment de `Session.user`, `User` e `JWT` com `id`, `adminRole`, `planType`, `userType`, `favoriteClub`.

## migration.sql

```sql
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
```

## Evidencia esperada

- `npx prisma migrate dev --name M054-add-password-hash` em DEV verde.
- `npx prisma generate` sem warnings.
- `npx tsc --noEmit` em `footstock-next/` verde.
- Rollback documentado: `npx prisma migrate resolve --rolled-back M054-add-password-hash` + `ALTER TABLE "User" DROP COLUMN "passwordHash";`.

## Criterios de aceite

- AC-001: schema.prisma atualizado com `passwordHash String?` no `User`.
- AC-002: migration M054 aplicavel em DEV e documentadamente reversivel.
- AC-003: type augmentation compila (`tsc --noEmit` limpo).
- AC-004: nenhum test pre-existente quebra.

## Restricoes locais

- NAO criar index sobre `passwordHash` (Onda 1 nao precisa; lookup e por `email` ja indexado).
- Manter `User.id String @id @default(cuid())` como esta.
