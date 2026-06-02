# Migrar autenticacao FootStock de Supabase para Auth.js v5 + Railway Postgres

> Objetivo macro: substituir o backend de identidade Supabase Auth (atualmente bloqueado por `exceed_db_size_quota`) por Auth.js v5 beta (`next-auth@5.0.0-beta.31`) com `@auth/prisma-adapter` apontando para o Postgres ja hospedado na Railway. Onda 1 entrega o caminho minimo viavel (login + logout + change-password + seed dos 9 usuarios DEV em prod) com Supabase em fallback controlado por feature flag. Onda 2 (backlog) elimina Supabase Auth completamente (register, reset-password, webauthn, club-auth, browser components, drop de deps).
> Fluxo alvo: `/loop --task` (loop sobre execucao iterada de TASK-{k}.md, sem DCP — micro-architecture pontual fora de `delivery.json`).
> Modo: Onda 1 mantem coexistencia dual-auth com backfill silencioso de `passwordHash` em cada login Supabase bem-sucedido; Onda 2 desliga fallback apos janela de 30 dias com auditoria de cobertura.

---

## Contexto obrigatorio (ler antes de qualquer acao)

1. `.claude/commands/loop.md` + pasta `.claude/commands/loop/` — orquestrador do loop canonico.
2. `.claude/commands/loop/iteraction/{create-task,review-created-task,execute-task,review-executed-task,review-executed-loop}.md` — sub-pipeline iteration_template.
3. `.claude/commands/execute-task.md` — execucao unitaria (PRE-0 workspace scan, scaffold-check, BDD, AC-XXX).
4. **Schema atual**: `footstock-next/prisma/schema.prisma` linhas 240-303 (`User`) e 305-350 (`Account`, `Session`, `VerificationToken`). Tabelas do `@auth/prisma-adapter` ja existem. **`passwordHash` ainda nao existe no `User`** — confirmado por audit (gap critico).
5. **Wrapper NXAUTH-04A existente**: `footstock-next/src/lib/auth.ts` exporta `detectIdentityConflict`, `clearDualCookies`, `handleIdentityConflict`, `getAuthUser`, `serializeUser`, `hasPlan`. **NAO exporta** `auth/signIn/signOut` ainda — o handler raiz do NextAuth() nao foi escrito. Reaproveitar `clearDualCookies` nos callbacks da nova config.
6. **Adapter ja preparado**: `footstock-next/src/lib/authjs-adapter.ts` envelopa `PrismaAdapter` com guard auto-create (referenciado em `tests/integration/authjs-adapter.test.ts`).
7. **13 callsites Supabase Auth** (toda a superficie atual, mapear por commit):
   - `app/api/v1/auth/login/route.ts:122` — `supabaseAdmin.auth.signInWithPassword` (alvo TASK-3).
   - `app/api/v1/auth/register/route.ts:129,156,383` — `auth.admin.createUser/deleteUser` (Onda 2).
   - `app/api/v1/auth/forgot-password/route.ts:78` — `resetPasswordForEmail` (legacy). Linha 57 ja chama `signIn('resend')` quando `AUTH_ENABLE_MAGIC_LINK_RESET=true` (NXAUTH-07 path, **manter ativo na Onda 1**).
   - `app/api/v1/auth/reset-password/route.ts:61` — `exchangeCodeForSession` (Onda 2).
   - `app/api/v1/auth/webauthn/authenticate/route.ts:116` — `auth.admin.generateLink` (Onda 2; precisa estrategia alternativa).
   - `app/api/v1/auth/logout/route.ts:23` — `auth.admin.signOut(userId)` (alvo TASK-4).
   - `app/api/v1/users/me/password/route.ts:95,120` — `signInWithPassword` + `auth.admin.updateUserById` (**alvo TASK-6**, quebra apos seed se nao migrado).
   - `app/api/v1/club/auth/login/route.ts:80` + `club/auth/forgot-password/route.ts:47` (Onda 2).
   - `src/middleware.ts:41` — `supabase.auth.getUser` por request (alvo TASK-2 refactor).
   - `src/app/api/middleware.ts:81,117` — dual middleware (Onda 2).
   - Browser: `app/(app)/inbox/page.tsx:20`, `components/notifications/NotificationBell.tsx:24` — `supabase.auth.getUser` no client (Onda 2 com `useSession`).
8. **Login route detalhado** (`footstock-next/src/app/api/v1/auth/login/route.ts`): IP rate-limit 20/window pre-check; email rate-limit 5 fails / 15min via Redis (`atomicIncrWithTtl`); brute-force notification via `emailNotificationService.sendForType('BRUTE_FORCE_BLOCKED')` aos 5 fails; resposta `{ user, session: { access_token, refresh_token, expires_at }, requiresOnboarding }`. **Preservar 100% do rate-limit + notification** na TASK-3.
9. **Dev-login route** (`app/api/v1/auth/dev-login/route.ts`): bypass total de Supabase em `NODE_ENV !== 'production'`, seta 3 cookies (`fs_dev_auth`, `fs-admin-role`, `fs_dev_club_id`). **NAO TOCAR** nesta task — login-form ja faz roteamento dev vs prod (commit 916bc76).
10. **Cookies em uso**: dev (`fs_dev_auth`, `fs-admin-role`, `fs_dev_club_id`), Supabase legado (`sb-access-token`, `sb-refresh-token`, `sb-code-verifier`), Auth.js v5 alvo (`__Secure-authjs.session-token` em prod, `authjs.session-token` em dev). `clearDualCookies` ja remove `sb-*`, `next-auth.*`, `authjs.*` — reaproveitar.
11. **Deps ja instaladas** (`footstock-next/package.json`): `next-auth@^5.0.0-beta.31`, `@auth/prisma-adapter@^2.11.2`, `bcryptjs@^3.0.3`, `@types/bcryptjs@^2.4.6`. Nada a instalar para Onda 1.
12. **Tests existentes**: `tests/integration/auth-dual-cookie-conflict.test.ts`, `tests/integration/authjs-adapter.test.ts`, `tests/integration/rateLimit.test.ts`. Adicionar suite nova: `tests/integration/auth-credentials-provider.test.ts` + `tests/integration/login-route-dual-stack.test.ts`.
13. **Env vars target Onda 1** (Railway service `web`): `AUTH_SECRET` (preferred v5, ja existe como `NEXTAUTH_SECRET` — copiar valor para a chave nova mantendo a antiga durante transicao), `AUTH_TRUST_HOST=true` (**obrigatorio em Railway**, sem isso = `UntrustedHost` silencioso em prod), `FEATURE_AUTH_SUPABASE_FALLBACK=true` (kill switch novo). `AUTH_URL` opcional (inferido dos headers).
14. **Railway Postgres**: usar `DIRECT_URL_PROD` (porta 5432, session pooler) para `prisma migrate deploy`. **NAO** usar `DATABASE_URL` em pgbouncer porta 6543 para migrate (advisory locks falham em transaction mode). Para runtime, app le `DATABASE_URL`.

Restricoes gerais:
- Idioma pt-BR; sem emojis; sem travessao.
- Regras Zero (Orfaos, Silencio, Estados Indefinidos, Fluxos Incompletos, Assumido, ECU).
- Trunk-based / always main: PROIBIDO `git checkout -b`, `git switch -c`. Rollback via `git revert <sha>` ou GitHub UI.
- `execute-task` exige PRE-0 (workspace scan) e scaffold-check antes de qualquer write.
- Mascarar tokens, senhas, DSNs e session tokens em qualquer log/output (`{first10}***{last4}`). Defesa anti-timing: nunca logar tempo total entre user-not-found e bcrypt-fail (devem ser indistinguiveis).
- Nao commitar `.env*`. Nao bypassar hooks (`--no-verify` proibido).
- `prisma migrate deploy` + seed em producao exigem **confirmacao humana explicita por etapa** (uma confirmacao para migrate, outra para seed).
- `User.id` permanece `String @id @default(cuid())`. Users legados Supabase mantem o uuid Supabase ja gravado em `User.id` (gravados pelo seed historico ou pelo register route). Auth.js Credentials emite tokens com `token.id = user.id` independente do formato.
- Defesa de timing attack: `authorize()` SEMPRE executa um bcrypt compare (real ou dummy) antes de retornar `null`, para tempo de resposta uniforme entre email-existe-senha-errada e email-nao-existe.
- Defesa de race condition no backfill: usar `prisma.user.updateMany({ where: { id, passwordHash: null }, data: { passwordHash } })` em vez de `update`, para que dois logins concorrentes nao tentem hash duplicado.
- Cost factor bcrypt: 12 (industry standard). NAO usar `bcrypt` nativo — `bcryptjs` (pure JS) ja esta instalado e compatible com Railway nixpacks.
- bcryptjs NAO roda em Edge runtime. Toda rota que chama `authorize()` deve declarar Node runtime (default em route handlers App Router). Middleware so pode decodificar JWT (edge-safe).
- Session strategy = `"jwt"` (NAO `"database"`): Credentials provider em Auth.js v5 beta nao persiste rows em `Session` (gap documentado em authjs/next-auth#12849). Tentar database sessions com Credentials causa `session` callback receber `null`.

---

## Task por item

Cada item do Listable Set descreve uma TASK-{k}.md sob `output/wbs/foot-stock/micro-architecture/auth-migration/`:

### Item 1 — TASK-1: Schema migration M054 + type augmentation
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-1.md`
- module_id: N/A (micro-architecture)
- arquivos tocados:
  - `footstock-next/prisma/schema.prisma` (adicionar `passwordHash String?` no `User`, sem index)
  - `footstock-next/prisma/migrations/M054-add-password-hash/migration.sql` (novo)
  - `footstock-next/src/types/next-auth.d.ts` (novo): augment `Session.user` + `User` + `JWT` com `id`, `adminRole`, `planType`, `userType`, `favoriteClub`.
- migration.sql:
  ```sql
  ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
  ```
  (Postgres 14+: `ADD COLUMN` nullable sem default = metadata-only, non-blocking, instantaneo, sem table rewrite, sem lock pesado.)
- evidencia_esperada:
  - `npx prisma migrate dev --name M054-add-password-hash` em DEV verde.
  - `npx prisma generate` sem warnings.
  - `npx tsc --noEmit` em `footstock-next/` verde.
  - Rollback documentado: `npx prisma migrate resolve --rolled-back M054-add-password-hash` + `ALTER TABLE "User" DROP COLUMN "passwordHash";`.
- AC: AC-001 schema atualizado; AC-002 migration aplicavel/reversivel; AC-003 type augmentation compila; AC-004 nenhum test pre-existente quebra.

### Item 2 — TASK-2: Auth.js v5 split config + route handler + middleware refactor
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-2.md`
- module_id: N/A
- arquivos tocados:
  - `footstock-next/src/auth.config.ts` (novo, **edge-safe**): exporta `authConfig` satisfies `NextAuthConfig` sem `adapter` e sem `bcryptjs`. So contem `providers: []` (sentinela vazio, Credentials adicionado na config Node), `callbacks.authorized` (gate de middleware), `pages: { signIn: '/login' }`, `session: { strategy: 'jwt' }`, `trustHost: true` (espelha `AUTH_TRUST_HOST=true`).
  - `footstock-next/src/auth.ts` (novo, **Node**): importa `authConfig`, adiciona `adapter: prismaAdapterWithGuard(prisma)` (reaproveitando `authjs-adapter.ts`), adiciona `Credentials` provider (logica detalhada em TASK-3), wire de callbacks `jwt`/`session` propagando custom fields, callback `signIn` invocando `handleIdentityConflict` quando detectar dual-cookie via `clearDualCookies`. Exporta `{ handlers, auth, signIn, signOut }`.
  - `footstock-next/src/app/api/auth/[...nextauth]/route.ts` (novo): `export const { GET, POST } = handlers; export const runtime = 'nodejs';`.
  - `footstock-next/src/middleware.ts` (modificar): importar EXCLUSIVAMENTE `auth.config.ts` (NAO `auth.ts`), usar `NextAuth(authConfig).auth` como middleware. Manter call para `supabase.auth.getUser` ATRAS de check `if (request.cookies.get('__Secure-authjs.session-token') || request.cookies.get('authjs.session-token')) { /* Auth.js path */ } else if (FEATURE_AUTH_SUPABASE_FALLBACK) { /* Supabase legacy */ }`. Sem isso, middleware fica em estado indefinido durante transicao.
  - `footstock-next/.env.example` (modificar): adicionar `AUTH_SECRET=`, `AUTH_TRUST_HOST=true`, `AUTH_URL=` (opcional), `FEATURE_AUTH_SUPABASE_FALLBACK=true` com comentarios indicando significado.
  - Railway env vars do service `web`: criar `AUTH_SECRET` (copiar valor de `NEXTAUTH_SECRET` ja existente), `AUTH_TRUST_HOST=true`, `FEATURE_AUTH_SUPABASE_FALLBACK=true`. **Confirmar com humano antes de chamar `railway variables set`**.
- evidencia_esperada:
  - `npx tsc --noEmit` verde.
  - `npm test -- --silent tests/integration/authjs-adapter.test.ts` continua verde.
  - Importacao circular ausente: `node -e "require('./.next/server/app/api/auth/[...nextauth]/route.js')"` apos build local nao falha.
  - Smoke local: `curl -X POST http://localhost:3000/api/auth/signin/credentials -d 'email=...&password=...'` retorna 302 ou JSON conforme contrato Auth.js.
  - Bundle analyser (`ANALYZE=true npm run build`) confirma que middleware bundle NAO contem `bcryptjs` (tree-shake limpo via `auth.config.ts`).
- AC: AC-001 split config criado; AC-002 route handler exporta GET/POST com runtime=nodejs; AC-003 middleware decide via cookie presence; AC-004 env vars adicionadas; AC-005 bundle Edge limpo.

### Item 3 — TASK-3: Login route dual-stack com backfill, timing defense e race safety
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-3.md`
- module_id: N/A
- arquivos tocados:
  - `footstock-next/src/lib/auth-credentials.ts` (novo): exporta `authorizeCredentials(credentials)` puro (sem `NextAuth()` wrapping), com logica abaixo. Permite teste unitario direto sem mock de NextAuth.
  - `footstock-next/src/auth.ts` (modificar TASK-2): registrar `Credentials({ credentials: { email: {}, password: {} }, authorize: authorizeCredentials })`.
  - `footstock-next/src/app/api/v1/auth/login/route.ts` (modificar): preservar IP rate-limit + Redis fail counter + brute-force notification. Substituir bloco 122-165: tentar `signIn('credentials', { redirect: false, email, password })` PRIMEIRO; em caso de `CredentialsSignin` E `FEATURE_AUTH_SUPABASE_FALLBACK=true` E `user.passwordHash == null`, fallback para `supabaseAdmin.auth.signInWithPassword`; em caso de sucesso Supabase, backfill assincrono via fire-and-forget (`void backfillPasswordHash(user.id, password)`). Retornar shape ja existente: `{ user, session: { access_token, refresh_token, expires_at }, requiresOnboarding }` — em caminho Auth.js, derivar `access_token` do JWT Auth.js (use `encode` de `next-auth/jwt`) para preservar contrato client; refresh_token = null (Auth.js sem refresh em JWT strategy); expires_at = Date.now() + 30*24*3600*1000.
  - `footstock-next/src/lib/auth-credentials.ts` logica de `authorizeCredentials`:
    1. Validar payload via Zod (reaproveitar `loginSchema`).
    2. `user = await prisma.user.findUnique({ where: { email } })`.
    3. **Timing defense**: dummy bcrypt compare quando `!user || !user.passwordHash` usando hash placeholder fixo (`DUMMY_HASH = '$2a$12$' + '.'.repeat(53)`); descartar resultado.
    4. Se `!user`: retornar `null`.
    5. Se `!user.passwordHash`: retornar `null` (caller decide fallback Supabase).
    6. `ok = await bcrypt.compare(password, user.passwordHash)`.
    7. Se `!ok`: retornar `null`.
    8. Retornar `{ id: user.id, email: user.email, name: user.name, adminRole: user.adminRole, planType: user.planType, userType: user.userType, favoriteClub: user.favoriteClub }`.
  - Funcao `backfillPasswordHash(userId, plaintext)` em `lib/auth-credentials.ts`:
    ```ts
    const hash = await bcrypt.hash(plaintext, 12)
    await prisma.user.updateMany({
      where: { id: userId, passwordHash: null },
      data: { passwordHash: hash, updatedAt: new Date() },
    })
    // updateMany com where passwordHash:null = race-safe; segundo login concorrente vira no-op.
    ```
  - Audit log: adicionar Sentry breadcrumb `{ category: 'auth', message: 'login_path', data: { path: 'authjs'|'supabase_fallback'|'fail', backfill_applied: bool } }`. NUNCA incluir email ou senha no breadcrumb.
- evidencia_esperada:
  - `tests/integration/login-route-dual-stack.test.ts` (novo, 6+ casos): (1) login Auth.js puro com user que tem passwordHash; (2) login Supabase fallback com user sem passwordHash + backfill verificavel; (3) login Auth.js path falha quando senha errada (sem fallback se passwordHash existe); (4) timing defense: medir delta de duracao entre user-not-found e wrong-password — deve ser < 50ms (3 sigma); (5) race-safe: rodar 10 logins concorrentes do mesmo user-sem-passwordHash e validar que `passwordHash` final == hash do primeiro login; (6) rate-limit preservado (5 fails em janela).
  - `tests/unit/auth-credentials.test.ts` (novo): cobrir `authorizeCredentials` em isolamento (mock Prisma).
  - Smoke local: curl com cada user de teste apos seed.
- AC: AC-001 login dual-stack funcional; AC-002 backfill silencioso aplica; AC-003 timing defense valida; AC-004 race-safe valida; AC-005 rate-limit preservado; AC-006 contrato de resposta cliente preservado.

### Item 4 — TASK-4: Logout route + clearDualCookies wiring + cookie strategy
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-4.md`
- module_id: N/A
- arquivos tocados:
  - `footstock-next/src/app/api/v1/auth/logout/route.ts` (modificar): chamar `await signOut({ redirect: false })` do Auth.js PRIMEIRO; em seguida `if (FEATURE_AUTH_SUPABASE_FALLBACK) await supabaseAdmin.auth.admin.signOut(userId)` para invalidar refresh tokens legados; finalizar com `clearDualCookies(response)` para garantir limpeza de `sb-*` + `authjs.*` + `next-auth.*`.
  - `footstock-next/src/auth.ts` (modificar TASK-2): adicionar `cookies: { sessionToken: { name: process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' } } }`. Confirma defaults v5 explicitamente para evitar surpresas.
  - `footstock-next/src/auth.ts` callback `signIn`: invocar `detectIdentityConflict` quando ambos cookies presentes; se conflict, `handleIdentityConflict` + retornar `false` (bloqueia o sign-in e forca limpeza pelo client).
- evidencia_esperada:
  - Smoke local: login -> logout -> validar que `Set-Cookie` response contem `Max-Age=0` para `__Secure-authjs.session-token` + `sb-access-token` + `sb-refresh-token`.
  - `tests/integration/logout-route.test.ts` (novo ou atualizar): cobrir logout Auth.js puro, logout Supabase legado, logout dual.
  - `tests/integration/auth-dual-cookie-conflict.test.ts` continua verde (ja existe, garante `detectIdentityConflict` ainda funciona).
- AC: AC-001 logout invalida ambos cookies; AC-002 conflito dual-cookie bloqueia sign-in; AC-003 cookie names corretos por ambiente.

### Item 5 — TASK-5: Seed script Prisma + bcrypt + upsert (substitui seed-prod-test-users)
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-5.md`
- module_id: N/A
- arquivos tocados:
  - `scripts/seed-prod-test-users.ts` (reescrever): remover import de `@supabase/supabase-js`; importar `bcryptjs`; usar `prisma.user.upsert({ where: { email }, update: { passwordHash: hash, ...rest }, create: { id: cuid(), email, passwordHash: hash, ...rest } })`. Idempotente. **NAO** rodar Supabase Auth Admin API.
  - Logica completa:
    ```ts
    import bcrypt from 'bcryptjs'
    import { createId as cuid } from '@paralleldrive/cuid2'  // ou usar @prisma/client cuid via default
    // (alternativa: deixar Prisma gerar via @default(cuid()) — omitir id no create payload)

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
  - Logging: NUNCA imprimir o `passwordHash` ou a `profile.password` (mascarar como `***`).
  - Dry-run mode: ler `process.env.SEED_DRY_RUN`; se truthy, executar `prisma.user.findUnique` em vez de `upsert` e imprimir o diff esperado.
- evidencia_esperada:
  - Rodar local apontando para Railway Postgres DEV: `DATABASE_URL=$(railway run --service web --environment development -- printenv DATABASE_URL) SEED_DRY_RUN=1 node --experimental-strip-types scripts/seed-prod-test-users.ts` — output mostra 9 diffs.
  - Rodar real em DEV: `node --experimental-strip-types scripts/seed-prod-test-users.ts` — 9 rows com `passwordHash != null`.
  - `npx tsc --noEmit scripts/seed-prod-test-users.ts` verde (ou validar via root tsconfig se aplicavel).
  - Re-rodar (idempotencia): segunda execucao reporta todos como `updated`, nenhum como `created`.
- AC: AC-001 seed cria 9 users com passwordHash; AC-002 idempotente; AC-003 sem credenciais em logs; AC-004 dry-run funciona.

### Item 6 — TASK-6: Migrar endpoint de change-password para bcrypt (prevenir regressao pos-seed)
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-6.md`
- module_id: N/A
- arquivos tocados:
  - `footstock-next/src/app/api/v1/users/me/password/route.ts` (modificar):
    1. Substituir linha 95 (`signInWithPassword` verify-old) por: se `user.passwordHash != null`, `bcrypt.compare(oldPassword, user.passwordHash)`; senao se `FEATURE_AUTH_SUPABASE_FALLBACK`, fallback Supabase + backfill apos sucesso.
    2. Substituir linha 120 (`auth.admin.updateUserById`) por: `await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })`. Em paralelo, se `FEATURE_AUTH_SUPABASE_FALLBACK`, atualizar Supabase tambem (para users que ainda autenticam via Supabase em outros devices ate cookie expire).
    3. Preservar audit log + email notification de password change existente.
- evidencia_esperada:
  - `tests/integration/users-me-password.test.ts` (novo ou atualizar): cobrir change com passwordHash existente, change com backfill, change com fallback Supabase.
  - Smoke local: login -> change-password -> logout -> login com nova senha funciona.
- AC: AC-001 change funciona com passwordHash bcrypt; AC-002 fallback Supabase preserva enquanto flag ON; AC-003 audit log preservado.

### Item 7 — TASK-7: Deploy prod + migrate + seed + smoke E2E + lista final
- task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-7.md`
- module_id: N/A
- acoes (cada etapa exige **confirmacao humana explicita** antes da execucao):
  1. Merge para `main` (commit unico ou serie atomica) com TASKS 1-6 aplicadas e CI verde.
  2. Confirmar env vars no Railway service `web`: `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `FEATURE_AUTH_SUPABASE_FALLBACK=true`. Validar via `railway variables --service web | grep -E '^(AUTH_|FEATURE_)'`.
  3. Deploy automatico via Railway (push para `main` dispara). Aguardar build verde.
  4. **Confirmacao humana** antes de: `railway run --service web -- npx prisma migrate deploy` (aplica M054 em prod). Validar output: "1 migration applied" + `\d "User"` mostra `passwordHash | text |  |`.
  5. **Confirmacao humana** antes de: `railway run --service web -- node --experimental-strip-types scripts/seed-prod-test-users.ts`. Validar output: 9 rows upserted.
  6. Smoke prod (5 personas):
     - `curl -i -X POST https://www.foot-stock.com.br/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@foot-stock.test","password":"FootStock@Dev2026!"}'` -> 200 + cookie `__Secure-authjs.session-token`.
     - Idem para `craque@foot-stock.test`, `jogador@foot-stock.test`, `lenda@foot-stock.test`, `clube-parceiro@foot-stock.test`.
     - Playwright headless local apontando para prod: 5 smoke tests (superadmin -> `/admin`, craque -> `/mercado`, jogador -> `/mercado`, lenda -> `/mercado`, clube-parceiro -> `/club`).
  7. Confirmar via Railway logs Sentry breadcrumbs: cada login emite `path: 'authjs'` (Auth.js path puro, sem fallback Supabase — `passwordHash` ja semeado).
  8. Postar no thread a lista final dos 9 usuarios com (email, role/plano, club opcional, path do login bem-sucedido).
- evidencia_esperada:
  - Log de `prisma migrate deploy` (mascarado).
  - Log de `seed-prod-test-users.ts` mostrando 9 upserts.
  - 5 responses 200 de smoke curl + screenshots Playwright.
  - Sentry filter mostrando `path: 'authjs'` em todos os 5 logins.
  - Mensagem no thread com a lista.
- AC: AC-001 migrate prod aplicada; AC-002 9 users seed; AC-003 5 smoke prod passa; AC-004 todos logins via Auth.js path puro; AC-005 lista postada.

---

## Modulo alvo

`N/A — micro-architecture` (fora do canonical loop A..I de DCP). Artefatos vivem em `output/wbs/foot-stock/micro-architecture/auth-migration/`.

---

## Iteration template

- `model`: opus
- `effort`: high
- `task_type`: `task`
- `acao_unitaria`: `/execute-task --task {task_path}` (sem `--module` — micro-architecture).

---

## Evidencia esperada por iteracao

Cada item produz:
- Diff aplicado (commit atomico em `main`).
- AC-XXX 100% validados (cada task declara seus AC-001..AC-00N).
- Output mascarado de comandos relevantes (migrate, tests, seed dry-run).
- Para tasks com novo codigo: suite de testes correspondente + cobertura.
- Para TASK-7: log completo do deploy + lista final dos 9 users.

---

## Parte 1 — Estruturar loop

Inputs:
- Este MD em `blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md`.

Acoes:
- `/loop --task blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md`.
- `/loop:create-structure` cria `blacksmith/loop-archives/migrate-supabase-auth-to-authjs-railway/` com `source.md`, `PROGRESS.md` (7 linhas, uma por TASK), `tasks/T-opus-high.md`, `tasks/items/task-{001..007}-{slug}.md`, `_LOOP-CONFIG.json` (schema V3 + `daily_loop`).
- `/loop:individual-analysis` valida cada TASK (AC declarados, evidencia mapeada, target dentro do `loop_root`).
- `/loop:integration` resolve tokens em `items[].commands`.
- `/loop:review` aplica W1..W5 + C1..C13.
- `/loop:workflow-app --name migrate-supabase-auth-to-authjs-railway` aplica W1..W9 + emite `_HANDOFF.md`.

Outputs:
- `blacksmith/loop-archives/migrate-supabase-auth-to-authjs-railway/_LOOP-CONFIG.json` pronto para o workflow-app.

Gates:
- `/loop:workflow-app` retorna verdict `APROVADO` ou `APROVADO_COM_AVISOS`.
- `metadata.workflow_app_completed_at` presente no JSON.

---

## Parte 2 — Pre-flight por task

Inputs:
- Cada `tasks/items/task-{NNN}-{slug}.md` criado na Parte 1.

Acoes:
- `/loop:iteraction:review-created-task --task {path}` executado per-item pelo workflow-app antes de `execute-task`.
- Validar PRE-0: cada task lista arquivos exatos tocados; nenhum path fora de `footstock-next/`, `scripts/`, `prisma/migrations/`.
- Validar AC-XXX completos.

Outputs:
- Verdict por task em `tasks/items/task-{NNN}-{slug}.review-created.md`.

Gates:
- Verdict `READY` per item antes de execucao.
- Zero gaps criticos.

---

## Parte 3 — Execucao iterada (operada pelo workflow-app)

Inputs:
- Fila enfileirada pelo botao `queue-btn-create-daily-loop` do workflow-app apos importar `_LOOP-CONFIG.json`.

Acoes per item:
- `/loop:iteraction:execute-task --task {path}` invoca `/execute-task --task {path}` com PRE-0 scan + scaffold-check + BDD + AC validados.
- `/loop:iteraction:review-executed-task --task {path}` audita diff + evidencia + testes.
- TASK-1: rodar `npx prisma migrate dev --name M054-add-password-hash` em DEV antes de marcar done.
- TASK-2: rodar `npx tsc --noEmit` + `npm test -- --silent` + `ANALYZE=true npm run build` (validar bundle middleware sem bcryptjs).
- TASK-3: rodar suite nova `tests/integration/login-route-dual-stack.test.ts` + suite unit `tests/unit/auth-credentials.test.ts`; smoke local com curl contra cada user dev.
- TASK-4: rodar suite logout + smoke cookie cleanup.
- TASK-5: rodar dry-run + real em DEV; validar 9 rows.
- TASK-6: rodar suite users-me-password + smoke login -> change -> logout -> login.
- TASK-7: **CONFIRMACAO HUMANA OBRIGATORIA** antes de `prisma migrate deploy` em prod **E** antes do seed em prod. Mascarar URLs/tokens em logs.

Outputs:
- 7 commits atomicos em `main` (um por task), convencao `feat(auth): ...` / `chore(prisma): ...` / `chore(scripts): ...` / `test(auth): ...`.
- Evidencia anexada por task.

Gates por item:
- AC-XXX 100% validados.
- Scaffold-check aprovado.
- Evidencia anexada (logs mascarados, output de testes, screenshots).
- Hooks pre-commit verdes (atomic-verifier, secrets check).
- CI verde no PR (caso aplicavel) ou no push direto a `main`.

---

## Parte 4 — Review final

Inputs:
- Os 7 itens completos com evidencia.

Acoes:
- `/loop:iteraction:review-executed-loop --name migrate-supabase-auth-to-authjs-railway` consolida.
- Verificacoes de producao (5 personas):
  - `superadmin@foot-stock.test` -> 200 + redirect para `/admin`.
  - `admin@foot-stock.test` -> 200 + `/admin`.
  - `craque@foot-stock.test` -> 200 + `/mercado`.
  - `lenda@foot-stock.test` -> 200 + `/mercado`.
  - `clube-parceiro@foot-stock.test` -> 200 + `/club`.
- Validar via Sentry/logs que todos os logins emitiram `path: 'authjs'` (sem fallback Supabase).
- Postar lista final dos 9 usuarios no thread (email + role + plano + clubId).
- Abrir backlog `output/wbs/foot-stock/micro-architecture/auth-migration/ONDA-2-BACKLOG.md` cobrindo:
  - Register route (drop `auth.admin.createUser`, usar `signIn('credentials', ...)` apos `prisma.user.create`).
  - Reset-password (finalizar Auth.js Resend path, drop `exchangeCodeForSession`).
  - Forgot-password (apagar fallback Supabase apos janela de 30 dias com 100% backfill).
  - WebAuthn route (substituir `auth.admin.generateLink` por token-based recovery via Auth.js + VerificationToken).
  - Club auth login/forgot (mesma migracao do login principal).
  - Browser components (`inbox/page.tsx`, `NotificationBell.tsx`): trocar `supabase.auth.getUser` por `useSession` de `next-auth/react`.
  - API middleware dual (`app/api/middleware.ts`): unificar em Auth.js.
  - Drop deps `@supabase/supabase-js` + `@supabase/ssr` apos coverage 100%.
  - Plano de reset de senha para users legados que nunca logaram (notificacao por email + magic-link Auth.js Resend).
  - Remover flag `FEATURE_AUTH_SUPABASE_FALLBACK`.
  - Remover wrapper NXAUTH-04A apos Onda 2 (sem dual-cookie possivel).

Outputs:
- `_LOOP-LOG.md` consolidado.
- Mensagem no thread com lista dos 9 usuarios.
- `ONDA-2-BACKLOG.md` criado.

Gates:
- Zero tasks com gap critico.
- 5 smoke E2E prod verdes.
- Lista postada.
- Backlog Onda 2 documentado.

---

## Gates globais

- Zero `.env*` commitado.
- Zero token/senha/hash em logs (mascaramento `{first10}***{last4}` ou substituicao por `***`).
- Zero `--no-verify`, `--no-gpg-sign`, `git checkout -b`, `git switch -c`.
- Migracao M054 reversivel: doc inclui `migrate resolve --rolled-back` + `ALTER TABLE DROP COLUMN`.
- `DIRECT_URL_PROD` usado para `migrate deploy` (porta 5432, NAO pgbouncer 6543).
- Fallback Supabase desativavel via `FEATURE_AUTH_SUPABASE_FALLBACK=false` (kill switch testado em DEV antes de prod).
- `AUTH_TRUST_HOST=true` confirmado em Railway env (sem isso = `UntrustedHost` silencioso).
- `AUTH_SECRET` setado em Railway (copia de `NEXTAUTH_SECRET` existente).
- Timing-attack defense ativa em `authorize()` (dummy bcrypt para user-not-found).
- Race-safe backfill via `updateMany` com `where: passwordHash: null`.
- Cost factor bcrypt = 12.
- Login route preserva 100% do contrato de resposta cliente (`{ user, session, requiresOnboarding }`).
- Rate-limit IP + email + brute-force notification preservados.
- `data-testid="login-page"` continua renderizando os 9 botoes DEV APENAS em `NODE_ENV !== 'production'` (regressao zero do commit 916bc76).
- Wrapper `clearDualCookies` invocado no logout e no `signIn` callback quando dual-cookie detectado.
- Middleware NAO importa `bcryptjs` (validado via bundle analyser).

---

## Criterios de aceite globais

- 7 TASK-{k}.md executadas com evidencia.
- Coluna `User.passwordHash` existe em producao e populada para os 9 usuarios DEV.
- Endpoint `/api/v1/auth/login` aceita credenciais via Auth.js Credentials primariamente; Supabase fallback so dispara para users sem passwordHash; backfill silencioso garante migracao 1-time-only.
- Endpoint `/api/v1/users/me/password` aceita change-password com bcrypt (sem regressao).
- Endpoint `/api/v1/auth/logout` limpa cookies de ambos os stacks.
- 9 usuarios DEV conseguem login em prod via UI.
- Sentry mostra 5/5 smoke logins via path Auth.js puro (`path: 'authjs'`).
- Deploy Railway verde, CI verde, `tsc --noEmit` verde, suite de testes verde (≥ 4 novas suites: credentials, login-dual-stack, logout, users-me-password).
- `ONDA-2-BACKLOG.md` documenta as 10 tarefas restantes para eliminacao completa de Supabase Auth.
- Janela de backfill de 30 dias agendada (Onda 2 espera coverage 100% antes de desligar flag).

---

## Ordem de execucao estrita

1. `/loop --task blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md`
2. `/loop:create-structure --name migrate-supabase-auth-to-authjs-railway`
3. `/loop:individual-analysis --name migrate-supabase-auth-to-authjs-railway`
4. `/loop:integration --name migrate-supabase-auth-to-authjs-railway`
5. `/loop:review --name migrate-supabase-auth-to-authjs-railway`
6. `/loop:workflow-app --name migrate-supabase-auth-to-authjs-railway`
7. Operador importa `_LOOP-CONFIG.json` no workflow-app (PySide6) e clica `queue-btn-create-daily-loop`.
8. Per item (7x, ordem fixa TASK-1..TASK-7): `review-created-task` -> `execute-task` -> `review-executed-task` -> commit atomico em `main` -> CI verde antes do proximo.
9. `/loop:iteraction:review-executed-loop --name migrate-supabase-auth-to-authjs-railway`.
10. Postar lista final dos 9 usuarios no thread + abrir `ONDA-2-BACKLOG.md`.

---

## Apendice A — Snippets de referencia para implementacao

### A.1 `auth.config.ts` (edge-safe, sem adapter, sem bcrypt)

```ts
import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  trustHost: true, // espelha AUTH_TRUST_HOST=true; obrigatorio em Railway
  session: { strategy: "jwt" }, // Credentials provider exige JWT em v5 beta
  pages: { signIn: "/login" },
  providers: [], // sentinela; provider real em auth.ts (Node)
  callbacks: {
    authorized: ({ auth }) => !!auth,
  },
} satisfies NextAuthConfig
```

### A.2 `auth.ts` (Node, com adapter + Credentials)

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prismaAdapterWithGuard } from "@/lib/authjs-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"
import { authorizeCredentials } from "@/lib/auth-credentials"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: prismaAdapterWithGuard(prisma),
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Wire NXAUTH-04A conflict detection aqui se necessario
      return true
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.adminRole = (user as any).adminRole ?? null
        token.planType = (user as any).planType ?? null
        token.userType = (user as any).userType ?? null
        token.favoriteClub = (user as any).favoriteClub ?? null
      }
      if (trigger === "update" && session) {
        return { ...token, ...session }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      ;(session.user as any).adminRole = token.adminRole
      ;(session.user as any).planType = token.planType
      ;(session.user as any).userType = token.userType
      ;(session.user as any).favoriteClub = token.favoriteClub
      return session
    },
  },
})
```

### A.3 `types/next-auth.d.ts`

```ts
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      adminRole?: string | null
      planType?: string | null
      userType?: string | null
      favoriteClub?: string | null
    } & DefaultSession["user"]
  }
  interface User {
    adminRole?: string | null
    planType?: string | null
    userType?: string | null
    favoriteClub?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    adminRole?: string | null
    planType?: string | null
    userType?: string | null
    favoriteClub?: string | null
  }
}
```

### A.4 `lib/auth-credentials.ts` (esqueleto)

```ts
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const DUMMY_HASH = "$2a$12$" + "." .repeat(53) // hash placeholder para timing defense

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authorizeCredentials(credentials: unknown) {
  const parsed = credentialsSchema.safeParse(credentials)
  if (!parsed.success) {
    await bcrypt.compare("dummy", DUMMY_HASH) // timing defense
    return null
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !user.passwordHash) {
    await bcrypt.compare(parsed.data.password, DUMMY_HASH) // timing defense
    return null
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!ok) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    adminRole: user.adminRole,
    planType: user.planType,
    userType: user.userType,
    favoriteClub: user.favoriteClub,
  }
}

export async function backfillPasswordHash(userId: string, plaintext: string) {
  const hash = await bcrypt.hash(plaintext, 12)
  await prisma.user.updateMany({
    where: { id: userId, passwordHash: null },
    data: { passwordHash: hash, updatedAt: new Date() },
  })
}
```

### A.5 Middleware com gate por cookie presence

```ts
import { NextResponse, type NextRequest } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

const { auth: authjsMiddleware } = NextAuth(authConfig)

export default async function middleware(req: NextRequest) {
  const hasAuthjs = req.cookies.has("__Secure-authjs.session-token") || req.cookies.has("authjs.session-token")
  if (hasAuthjs) {
    return authjsMiddleware(req as any)
  }
  if (process.env.FEATURE_AUTH_SUPABASE_FALLBACK === "true") {
    // bloco Supabase legacy preservado (codigo atual)
    // ... createServerClient + getUser ...
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
```

---

## Apendice B — Comandos de verificacao em prod (mascarados)

```bash
# Confirmar env vars no Railway (mascarado)
railway variables --service web | grep -E '^(AUTH_|FEATURE_)' | sed 's/=.*/=***/'

# Aplicar migration em prod (CONFIRMACAO HUMANA antes)
railway run --service web -- npx prisma migrate deploy

# Validar schema atualizado em prod
railway run --service web -- npx prisma db execute --stdin <<< '\d "User"' | grep passwordHash

# Rodar seed em prod (CONFIRMACAO HUMANA antes)
railway run --service web -- node --experimental-strip-types scripts/seed-prod-test-users.ts

# Smoke 5 logins (mascarar response)
for EMAIL in superadmin admin craque lenda clube-parceiro; do
  curl -s -i -X POST https://www.foot-stock.com.br/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}@foot-stock.test\",\"password\":\"FootStock@Dev2026!\"}" \
    | head -n 1
done
```
