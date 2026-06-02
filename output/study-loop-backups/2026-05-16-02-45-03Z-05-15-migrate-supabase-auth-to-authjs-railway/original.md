# Migrar autenticacao FootStock de Supabase para Auth.js v5 + Railway Postgres

> Objetivo macro: substituir o backend de identidade Supabase Auth (atualmente bloqueado por `exceed_db_size_quota`) por Auth.js v5 (`next-auth@5.0.0-beta.31`) com `@auth/prisma-adapter` apontando para o Postgres ja hospedado na Railway, mantendo `User.id` estavel, preservando os 9 usuarios de teste DEV e desbloqueando o seed em producao.
> Fluxo alvo: `/loop --task` (loop sobre execucao iterada de TASK-{k}.md, sem DCP — micro-architecture pontual fora de `delivery.json`).

---

## Contexto obrigatorio (ler antes de qualquer acao)

1. `.claude/commands/loop.md` + pasta `.claude/commands/loop/` — orquestrador do loop.
2. `.claude/commands/loop/iteraction/create-task.md`, `review-created-task.md`, `execute-task.md`, `review-executed-task.md`, `review-executed-loop.md` — sub-pipeline iteration_template.
3. `.claude/commands/execute-task.md` — execucao unitaria (PRE-0 workspace scan, scaffold-check, BDD, AC-XXX).
4. `footstock-next/prisma/schema.prisma` linhas 240-303 (model `User`) e linhas 305+ (`Account`, `Session`, `VerificationToken`) — tabelas do `@auth/prisma-adapter` ja existem; falta apenas a coluna `passwordHash` no `User`.
5. `footstock-next/src/lib/auth.ts` — wrapper NXAUTH-04A ja contem kill-switch + `detectIdentityConflict` (resto da migracao anterior abortou; reaproveitar).
6. `footstock-next/src/app/api/v1/auth/login/route.ts` linha 122 (`signInWithPassword`) e linha 164 (`prisma.user.findUnique({ where: { id: authData.user.id } })`) — ponto unico de validacao de senha que sera substituido por Credentials provider.
7. `footstock-next/src/lib/constants/dev-test-users.ts` — fonte canonica dos 9 usuarios DEV (chave = email, senha = `NEXT_PUBLIC_DEV_TEST_PASSWORD ?? 'FootStock@Dev2026!'`).
8. `scripts/seed-prod-test-users.ts` — seed atual; sera reescrito para usar Prisma + `bcryptjs` em vez de Supabase Admin API.
9. `.env.production` (resolvido via `railway run --service web -- env`) — variaveis canonicas; `DIRECT_URL_PROD` aponta para session pooler porta 5432 (NAO usar `DATABASE_URL` pgbouncer 6543 para migrate deploy).
10. Inventario dos 13 arquivos que chamam Supabase auth (rodar `grep -rn "supabaseAdmin\.auth\|createServerClient\|createBrowserClient" footstock-next/src` antes da Parte 5).

Restricoes gerais:
- Idioma pt-BR; sem emojis; sem travessao.
- Regras Zero (Orfaos, Silencio, Estados Indefinidos, Fluxos Incompletos, Assumido, ECU).
- Trunk-based / always main: PROIBIDO `git checkout -b` ou `git switch -c` em qualquer task. Rollback via `git revert <sha>` ou restore via GitHub UI.
- `execute-task` exige PRE-0 (workspace scan) e scaffold-check antes de qualquer write.
- Mascarar tokens, senhas e DSNs em qualquer log/output (`{first10}***{last4}`).
- Nao commitar `.env*` com segredos; nao bypassar hooks (`--no-verify` proibido).
- Migracoes destrutivas em producao (`prisma migrate deploy`, seed) exigem confirmacao humana explicita antes de cada execucao.
- `User.id` permanece `String @id @default(cuid())`; durante coexistencia, novos users criados por Auth.js manterao cuid, users legados Supabase manterao o uuid Supabase ja gravado.
- Auth.js v5 (beta.31) + `@auth/prisma-adapter` ja instalados (verificar `footstock-next/package.json` antes de qualquer install).

---

## Task por item

Cada item do Listable Set descreve uma TASK-{k}.md que sera criada em `output/wbs/foot-stock/micro-architecture/auth-migration/`:

1. **Item 1 — TASK-1: Schema migration M054 (`passwordHash` + indices)**
   - task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-1.md`
   - module_id: N/A (micro-architecture)
   - evidencia_esperada: arquivo `footstock-next/prisma/migrations/M054-add-password-hash/migration.sql` aplicado em DEV via `npx prisma migrate dev`; `User.passwordHash String?` no schema; `npx prisma generate` sem erros; teste unitario de Prisma client compila.

2. **Item 2 — TASK-2: Auth.js v5 config + route handler**
   - task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-2.md`
   - module_id: N/A
   - evidencia_esperada: `footstock-next/src/lib/auth.config.ts` exportando `authConfig` com `PrismaAdapter`, Credentials provider (bcryptjs compare), session JWT strategy, callbacks `jwt`/`session` propagando `id`, `email`, `adminRole`, `planType`, `userType`, `favoriteClub`; `footstock-next/src/app/api/auth/[...nextauth]/route.ts` exportando `GET`, `POST` via `NextAuth(authConfig).handlers`; `footstock-next/src/lib/auth.ts` ja existente exporta `auth`, `signIn`, `signOut` reaproveitando wrapper NXAUTH-04A; `npx tsc --noEmit` verde.

3. **Item 3 — TASK-3: Login route dual-stack (Credentials-first, Supabase fallback)**
   - task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-3.md`
   - module_id: N/A
   - evidencia_esperada: `footstock-next/src/app/api/v1/auth/login/route.ts` modificado para: (a) tentar `signIn('credentials', ...)` quando `user.passwordHash != null`; (b) cair em `supabaseAdmin.auth.signInWithPassword` apenas se passwordHash ausente E flag `FEATURE_AUTH_SUPABASE_FALLBACK=true`; (c) ao sucesso Supabase, fazer backfill assincrono do `passwordHash` (bcrypt da senha digitada) para acelerar migracao silenciosa; rate-limit + audit log preservados; `dev-login` route inalterada.

4. **Item 4 — TASK-4: Seed script Prisma + bcrypt (substitui seed-prod-test-users)**
   - task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-4.md`
   - module_id: N/A
   - evidencia_esperada: `scripts/seed-prod-test-users.ts` reescrito sem `@supabase/supabase-js`; usa `bcryptjs.hash(password, 12)`; idempotente via `prisma.user.upsert` por email; 9 usuarios DEV criados com `passwordHash` populado, mantendo todos os campos do payload atual (planType, adminRole, cpfHash, investorProfile, favoriteClub, userType, fsBalance, birthDate, tourCompleted); dry-run local apontando para Railway Postgres DEV confirma 9 rows.

5. **Item 5 — TASK-5: Deploy producao + smoke E2E + lista final de usuarios**
   - task_path: `output/wbs/foot-stock/micro-architecture/auth-migration/TASK-5.md`
   - module_id: N/A
   - evidencia_esperada: (a) `railway run --service web -- npx prisma migrate deploy` aplica M054 em prod; (b) `railway run --service web -- node --experimental-strip-types scripts/seed-prod-test-users.ts` cria os 9 usuarios; (c) `curl -X POST https://www.foot-stock.com.br/api/v1/auth/login` com `superadmin@foot-stock.test` retorna 200 + cookie de sessao Auth.js; (d) playwright smoke roda `data-testid="login-page"` para 1 usuario de cada plano (JOGADOR/CRAQUE/LENDA/CLUB_PARTNER/SUPER_ADMIN); (e) lista final dos 9 emails + role/plano postada no thread.

---

## Modulo alvo

`N/A — micro-architecture` (mudanca pontual, fora do canonical loop A..I de DCP). Artefatos vivem em `output/wbs/foot-stock/micro-architecture/auth-migration/`.

---

## Iteration template

- `model`: opus
- `effort`: high
- `task_type`: `task`
- `acao_unitaria`: `/execute-task --task {task_path}` (sem `--module` pois e micro-architecture)

---

## Evidencia esperada por iteracao

Cada item produz:
- Codigo aplicado (diff em `footstock-next/` ou `scripts/` ou `prisma/migrations/`).
- AC-XXX 100% validados na task (cada task declara seus AC-001..AC-00N).
- Evidencia anexada: log de `prisma migrate`, output de `tsc --noEmit`, output de `npm test -- --silent`, screenshot do login funcionando localmente.
- Para TASK-5: log completo do `railway run` (mascarado) + screenshot playwright + lista dos 9 usuarios.

---

## Parte 1 — Estruturar loop

Inputs:
- Este MD em `blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md`.

Acoes:
- `/loop --task blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md` — orquestrador.
- `/loop:create-structure` cria `blacksmith/loop-archives/migrate-supabase-auth-to-authjs-railway/` com `source.md`, `PROGRESS.md` (5 linhas), `tasks/T-opus-high.md`, `tasks/items/task-{001..005}-{slug}.md`, `_LOOP-CONFIG.json` (schema V3 + `daily_loop`).
- `/loop:individual-analysis` valida que cada TASK tem AC, evidencia, target dentro do `loop_root`.
- `/loop:integration` resolve tokens em `items[].commands`.
- `/loop:review` aplica W1..W5 + C1..C13.
- `/loop:workflow-app --name migrate-supabase-auth-to-authjs-railway` aplica W1..W9 + emite `_HANDOFF.md`.

Outputs:
- `blacksmith/loop-archives/migrate-supabase-auth-to-authjs-railway/_LOOP-CONFIG.json` pronto para o workflow-app.

Gates:
- `/loop:workflow-app` retorna verdict `APROVADO` ou `APROVADO_COM_AVISOS`.
- `metadata.workflow_app_completed_at` presente no JSON canonico.

---

## Parte 2 — Pre-flight por task

Inputs:
- Cada `tasks/items/task-{NNN}-{slug}.md` criado na Parte 1.

Acoes:
- `/loop:iteraction:review-created-task --task {path}` (executado per-item pelo workflow-app antes do `execute-task`).
- Validar PRE-0: cada task lista os arquivos exatos que serao tocados; nenhum path fora de `footstock-next/`, `scripts/`, `prisma/migrations/`.
- Validar AC-XXX completos antes de delegar para execute-task.

Outputs:
- Verdict por task em `tasks/items/task-{NNN}-{slug}.review-created.md`.

Gates:
- Verdict `READY` per item antes de execucao.
- Zero gaps criticos detectados.

---

## Parte 3 — Execucao iterada (operada pelo workflow-app)

Inputs:
- Fila enfileirada pelo botao `queue-btn-create-daily-loop` do `workflow-app` apos importar `_LOOP-CONFIG.json`.

Acoes per item:
- `/loop:iteraction:execute-task --task {path}` -> invoca `/execute-task --task {path}` com PRE-0 scan + scaffold-check + BDD + AC validados.
- `/loop:iteraction:review-executed-task --task {path}` audita diff aplicado, evidencia anexada, testes passando.
- TASK-1: rodar `npx prisma migrate dev --name M054-add-password-hash` em DEV antes de marcar done.
- TASK-2: rodar `npx tsc --noEmit` + `npm test -- --silent` antes de marcar done.
- TASK-3: rodar suite de testes do login route + smoke local com curl contra `localhost:3000/api/v1/auth/login`.
- TASK-4: rodar `node --experimental-strip-types scripts/seed-prod-test-users.ts` apontando para DATABASE_URL DEV; validar 9 rows com `passwordHash != null`.
- TASK-5: **CONFIRMACAO HUMANA OBRIGATORIA** antes de rodar `railway run --service web -- npx prisma migrate deploy` E antes de rodar o seed em prod. Mascarar todas as URLs e tokens nos logs.

Outputs:
- 5 commits atomicos em `main` (um por task), seguindo convencao `feat(auth): ...` / `chore(prisma): ...` / `chore(scripts): ...`.
- Evidencia anexada por task.

Gates por item:
- AC-XXX 100% validados.
- Scaffold-check aprovado.
- Evidencia anexada (logs mascarados, screenshots, output de testes).
- Hooks pre-commit verdes (atomic-verifier, secrets check).

---

## Parte 4 — Review final

Inputs:
- Os 5 itens completos com evidencia.

Acoes:
- `/loop:iteraction:review-executed-loop --name migrate-supabase-auth-to-authjs-railway` consolida.
- Verificar producao: login com `superadmin@foot-stock.test` + senha `FootStock@Dev2026!` retorna 200 e middleware redireciona para `/admin`.
- Verificar producao: login com `craque@foot-stock.test` retorna 200 e redireciona para `/mercado`.
- Verificar producao: login com `clube-parceiro@foot-stock.test` redireciona para `/club`.
- Postar no thread a lista final dos 9 usuarios criados em prod (email + role + plano + clubId quando aplicavel).
- Decidir cronograma de Onda 2 (remover `FEATURE_AUTH_SUPABASE_FALLBACK`, migrar register/forgot-password/webauthn/club-auth, plano de reset de senha para users legados Supabase).

Outputs:
- `_LOOP-LOG.md` consolidado.
- Mensagem no thread com lista dos 9 usuarios.
- Issue/task aberta para Onda 2 em `output/wbs/foot-stock/micro-architecture/auth-migration/ONDA-2-BACKLOG.md`.

Gates:
- Zero tasks com gap critico.
- 5 smoke tests E2E verdes em producao.
- Lista dos 9 usuarios postada.

---

## Gates globais

- Zero `.env*` commitado.
- Zero token/senha visivel em logs (mascaramento `{first10}***{last4}`).
- Zero `--no-verify`, `--no-gpg-sign`, `git checkout -b`, `git switch -c`.
- Migracao M054 reversivel via `npx prisma migrate resolve --rolled-back M054-add-password-hash` documentada na TASK-1.
- `DIRECT_URL_PROD` usado para `migrate deploy` (porta 5432, NAO pgbouncer 6543).
- Fallback Supabase desativavel via `FEATURE_AUTH_SUPABASE_FALLBACK=false` (kill switch).
- Auth.js JWT secret (`NEXTAUTH_SECRET`) ja existe em Railway env vars — confirmar antes da TASK-2 sem reescrever.

---

## Criterios de aceite globais

- 5 TASK-{k}.md executadas com evidencia anexada.
- Coluna `User.passwordHash` existe em producao e esta populada para os 9 usuarios DEV.
- Endpoint `/api/v1/auth/login` aceita credenciais via Auth.js Credentials provider primariamente; Supabase serve apenas como fallback para users legados sem `passwordHash`.
- 9 usuarios DEV conseguem fazer login em producao via UI (`https://www.foot-stock.com.br/login`).
- `data-testid="login-page"` continua renderizando os 9 botoes DEV APENAS em `NODE_ENV !== 'production'` (regressao zero do commit 916bc76).
- Deploy Railway verde, CI verde, sem warnings novos no `npx tsc --noEmit`.

---

## Ordem de execucao estrita

1. `/loop --task blacksmith/loop/05-15-migrate-supabase-auth-to-authjs-railway.md`
2. `/loop:create-structure --name migrate-supabase-auth-to-authjs-railway`
3. `/loop:individual-analysis --name migrate-supabase-auth-to-authjs-railway`
4. `/loop:integration --name migrate-supabase-auth-to-authjs-railway`
5. `/loop:review --name migrate-supabase-auth-to-authjs-railway`
6. `/loop:workflow-app --name migrate-supabase-auth-to-authjs-railway`
7. Operador importa `_LOOP-CONFIG.json` no `workflow-app` (PySide6) e clica em `queue-btn-create-daily-loop`.
8. Per item (5x): `review-created-task` -> `execute-task` -> `review-executed-task` -> commit atomico em `main`.
9. `/loop:iteraction:review-executed-loop --name migrate-supabase-auth-to-authjs-railway`.
10. Postar lista final dos 9 usuarios no thread e abrir backlog da Onda 2.
