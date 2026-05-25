---
description: Task 007 - TASK-6 Migrar endpoint change-password para bcrypt (prevenir regressao pos-seed)
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 007 - TASK-6: Migrar endpoint de change-password para bcrypt

Origem: `source.md` linhas 185-196 (Item 6 - TASK-6).

## Contexto

Apos seed dos 9 users (TASK-5), o endpoint `/api/v1/users/me/password` quebra se nao migrar verify-old + update-new para bcrypt. Aplicar mesma estrategia dual-stack da TASK-3: priorizar bcrypt, fallback Supabase com backfill apos sucesso enquanto `FEATURE_AUTH_SUPABASE_FALLBACK=true`.

## Arquivos tocados

- `footstock-next/src/app/api/v1/users/me/password/route.ts` (modificar):
  1. Substituir linha 95 (`signInWithPassword` verify-old): se `user.passwordHash != null`, `bcrypt.compare(oldPassword, user.passwordHash)`; senao se `FEATURE_AUTH_SUPABASE_FALLBACK`, fallback Supabase + backfill apos sucesso (`backfillPasswordHash` da TASK-3).
  2. Substituir linha 120 (`auth.admin.updateUserById`): `await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })`. Em paralelo, se `FEATURE_AUTH_SUPABASE_FALLBACK`, atualizar Supabase tambem (para users que ainda autenticam via Supabase em outros devices ate cookie expire).
  3. Preservar audit log + email notification de password change existente (zero regressao).

## Evidencia esperada

- `tests/integration/users-me-password.test.ts` (novo ou atualizar): cobrir
  - change com `passwordHash` existente (caminho bcrypt puro).
  - change com backfill (user-sem-`passwordHash`, dispara backfill + update bcrypt).
  - change com fallback Supabase (caminho legacy quando flag ON).
- Smoke local: login -> change-password -> logout -> login com nova senha funciona.

## Criterios de aceite

- AC-001: change-password funciona com `passwordHash` bcrypt (sem chamar Supabase quando user ja migrado).
- AC-002: fallback Supabase preservado enquanto flag ON, com backfill apos verify bem-sucedido.
- AC-003: audit log + email notification de password change preservados (zero regressao).

## Restricoes locais

- Reusar `backfillPasswordHash` da TASK-3 (NAO duplicar logica de hash).
- bcryptjs cost = 12.
- Update paralelo Supabase apenas atras de `if (FEATURE_AUTH_SUPABASE_FALLBACK)`.
- NAO logar `oldPassword` nem `newPassword` (mascarar via `***`).
