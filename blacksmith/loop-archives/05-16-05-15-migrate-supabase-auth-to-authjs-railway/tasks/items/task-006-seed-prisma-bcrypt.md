---
description: Task 006 - TASK-5 Seed script Prisma + bcrypt + upsert (substitui seed-prod-test-users, remove Supabase Auth Admin)
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 006 - TASK-5: Seed script Prisma + bcrypt + upsert

Origem: `source.md` linhas 140-183 (Item 5 - TASK-5).

## Contexto

Reescrever `scripts/seed-prod-test-users.ts` removendo dependencia de Supabase Auth Admin API. Usar `bcryptjs.hash` (cost 12) + `prisma.user.upsert` idempotente. Dry-run mode via env `SEED_DRY_RUN`.

## Arquivos tocados

- `scripts/seed-prod-test-users.ts` (reescrever):
  - Remover `import { createClient } from '@supabase/supabase-js'`.
  - Importar `bcryptjs`.
  - Para cada user em `DEV_TEST_USERS`: `prisma.user.upsert({ where: { email }, update: { passwordHash: hash }, create: { id: cuid(), email, passwordHash: hash, ...rest } })`.
  - Idempotente: segunda execucao mantem tudo igual (update so atualiza `passwordHash`).

## Logica completa (espelho do source.md)

```ts
import bcrypt from 'bcryptjs'
import { createId as cuid } from '@paralleldrive/cuid2'  // ou Prisma default

for (const [email, profile] of Object.entries(DEV_TEST_USERS)) {
  const passwordHash = await bcrypt.hash(profile.password, 12)
  const r = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },  // idempotencia: nao sobrescreve fields se ja existe
    create: {
      email,
      passwordHash,
      name: profile.name,
      cpfHash: cpfHashFor(email),
      planType: profile.planType,
      adminRole: profile.adminRole ?? null,
      investorProfile: 'INICIANTE',
      favoriteClub: profile.clubId ?? 'FLAM',
      userType: profile.adminRole
        ? (profile.adminRole === 'CLUB_PARTNER' ? 'CLUB_PARTNER' : 'ADMIN')
        : 'NORMAL',
      fsBalance: profile.planType === 'LENDA' ? 25000 : profile.planType === 'CRAQUE' ? 5000 : 2000,
      birthDate: new Date('1990-01-01'),
      tourCompleted: true,
    },
  })
  console.log(`  [${r.passwordHash === passwordHash ? 'upserted' : 'updated'}] ${email} -> ${r.id}`)
}
```

## Logging seguro

NUNCA imprimir `passwordHash` nem `profile.password`. Sempre mascarar como `***`.

## Dry-run mode

Ler `process.env.SEED_DRY_RUN`. Se truthy, executar `prisma.user.findUnique` em vez de `upsert` e imprimir diff esperado (sem escrever).

## Evidencia esperada

- Rodar local apontando para Railway Postgres DEV:
  ```bash
  DATABASE_URL=$(railway run --service web --environment development -- printenv DATABASE_URL) \
    SEED_DRY_RUN=1 \
    node --experimental-strip-types scripts/seed-prod-test-users.ts
  ```
  Output: 9 diffs esperados, zero escrita.
- Rodar real em DEV: `node --experimental-strip-types scripts/seed-prod-test-users.ts` -> 9 rows com `passwordHash != null`.
- `npx tsc --noEmit scripts/seed-prod-test-users.ts` verde (ou validar via root tsconfig se aplicavel).
- Re-rodar (idempotencia): segunda execucao reporta todos como `updated`, nenhum como `created`.

## Criterios de aceite

- AC-001: seed cria 9 users com `passwordHash` populado (cost 12 bcrypt).
- AC-002: idempotente (segunda execucao = no-op em todos os fields exceto refresh de `passwordHash`).
- AC-003: zero credenciais (senha plaintext ou hash) em logs.
- AC-004: dry-run funciona (sem escrita, com diff impresso).

## Restricoes locais

- bcryptjs cost factor = 12 fixo (alinhado com `authorizeCredentials` da TASK-3).
- NAO usar `prisma.user.create` direto (perde idempotencia se user ja existe).
- NAO chamar `supabaseAdmin.auth.admin.*` neste script (toda a logica vive em Prisma).
- `User.id` permanece cuid; users legados Supabase mantem o uuid Supabase ja gravado pelo register route.
