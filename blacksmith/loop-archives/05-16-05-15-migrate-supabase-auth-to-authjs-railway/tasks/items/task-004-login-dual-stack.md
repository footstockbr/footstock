---
description: Task 004 - TASK-3 Login route dual-stack com backfill silencioso, timing defense e race safety
model: opus
effort: high
scope: task
task_type: task
mode_support:
- write
---

# Task 004 - TASK-3: Login route dual-stack com backfill, timing defense e race safety

Origem: `source.md` linhas 95-125 (Item 3 - TASK-3). Snippet de referencia: source.md Apendice A.4 (`lib/auth-credentials.ts`).

## Contexto

Substituir bloco 122-165 de `app/api/v1/auth/login/route.ts` por fluxo dual-stack. Tentar `signIn('credentials', ...)` PRIMEIRO; fallback Supabase com backfill silencioso quando `user.passwordHash == null` E `FEATURE_AUTH_SUPABASE_FALLBACK=true`. Preservar 100% do rate-limit + brute-force notification existente. Preservar contrato de resposta cliente (`{ user, session: { access_token, refresh_token, expires_at }, requiresOnboarding }`).

## Arquivos tocados

- `footstock-next/src/lib/auth-credentials.ts` (novo): exporta `authorizeCredentials(credentials)` puro (sem `NextAuth()` wrapping) + `backfillPasswordHash(userId, plaintext)`. Permite teste unitario direto sem mock de NextAuth.
- `footstock-next/src/auth.ts` (modificar TASK-2): registrar `Credentials({ credentials: { email: {}, password: {} }, authorize: authorizeCredentials })`.
- `footstock-next/src/app/api/v1/auth/login/route.ts` (modificar):
  - Preservar IP rate-limit + Redis fail counter (`atomicIncrWithTtl`, 5 fails / 15min) + brute-force notification (`emailNotificationService.sendForType('BRUTE_FORCE_BLOCKED')` aos 5 fails).
  - Substituir linhas 122-165: tentar `signIn('credentials', { redirect: false, email, password })` PRIMEIRO.
  - Em caso de `CredentialsSignin` E `FEATURE_AUTH_SUPABASE_FALLBACK=true` E `user.passwordHash == null`, fallback para `supabaseAdmin.auth.signInWithPassword`.
  - Em caso de sucesso Supabase: backfill assincrono via fire-and-forget (`void backfillPasswordHash(user.id, password)`).
  - Retornar shape ja existente. Em caminho Auth.js, derivar `access_token` do JWT Auth.js via `encode` de `next-auth/jwt`; `refresh_token = null` (Auth.js sem refresh em JWT strategy); `expires_at = Date.now() + 30*24*3600*1000`.

## Logica de `authorizeCredentials`

1. Validar payload via Zod (reaproveitar `loginSchema`).
2. `user = await prisma.user.findUnique({ where: { email } })`.
3. **Timing defense:** dummy bcrypt compare quando `!user || !user.passwordHash` usando `DUMMY_HASH = '$2a$12$' + '.'.repeat(53)`; descartar resultado.
4. Se `!user`: retornar `null`.
5. Se `!user.passwordHash`: retornar `null` (caller decide fallback Supabase).
6. `ok = await bcrypt.compare(password, user.passwordHash)`.
7. Se `!ok`: retornar `null`.
8. Retornar `{ id, email, name, adminRole, planType, userType, favoriteClub }` do user.

## `backfillPasswordHash`

```ts
const hash = await bcrypt.hash(plaintext, 12)
await prisma.user.updateMany({
  where: { id: userId, passwordHash: null },
  data: { passwordHash: hash, updatedAt: new Date() },
})
// updateMany com where passwordHash:null = race-safe; segundo login concorrente vira no-op.
```

## Audit log

Sentry breadcrumb por tentativa: `{ category: 'auth', message: 'login_path', data: { path: 'authjs'|'supabase_fallback'|'fail', backfill_applied: bool } }`. NUNCA incluir email ou senha no breadcrumb.

## Evidencia esperada

- `tests/integration/login-route-dual-stack.test.ts` (novo, 6+ casos):
  1. login Auth.js puro com user que tem `passwordHash`.
  2. login Supabase fallback com user sem `passwordHash` + backfill verificavel.
  3. login Auth.js path falha quando senha errada (sem fallback se `passwordHash` existe).
  4. timing defense: medir delta entre user-not-found e wrong-password - deve ser < 50ms (3 sigma).
  5. race-safe: rodar 10 logins concorrentes do mesmo user-sem-`passwordHash` e validar `passwordHash` final = hash do primeiro login.
  6. rate-limit preservado (5 fails em janela).
- `tests/unit/auth-credentials.test.ts` (novo): cobrir `authorizeCredentials` em isolamento (mock Prisma).
- Smoke local: curl com cada user de teste apos seed.

## Criterios de aceite

- AC-001: login dual-stack funcional.
- AC-002: backfill silencioso aplica em users-sem-`passwordHash`.
- AC-003: timing defense valida (< 50ms delta).
- AC-004: race-safe valida (10 concorrentes -> 1 hash final).
- AC-005: rate-limit IP + email + brute-force notification preservados.
- AC-006: contrato de resposta cliente preservado byte-a-byte.

## Restricoes locais

- bcryptjs com cost factor 12 (industry standard).
- NUNCA logar tempo total entre user-not-found e bcrypt-fail (devem ser indistinguiveis).
- Defesa race: `updateMany` com `where: passwordHash: null` (nao `update`).
- Rota declara Node runtime (default em route handlers App Router). NAO bcryptjs em Edge.
- `refresh_token = null` no caminho Auth.js (JWT strategy nao emite refresh).
